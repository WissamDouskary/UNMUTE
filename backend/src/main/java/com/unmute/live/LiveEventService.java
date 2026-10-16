package com.unmute.live;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Pushes per-user events (AI tags added, transcription finished) to open browser tabs over Server-Sent
 * Events, so the UI updates without polling or a reload. Delivery is best-effort: a tab that misses an
 * event refetches when it reconnects, and the database stays the source of truth.
 */
@Service
public class LiveEventService {

    private static final Logger log = LoggerFactory.getLogger(LiveEventService.class);

    /** Clients reconnect after this; it also bounds how long a revoked token keeps receiving events. */
    static final Duration STREAM_TIMEOUT = Duration.ofMinutes(30);
    /** Below common proxy idle timeouts (60s), so idle streams are not cut. */
    private static final Duration HEARTBEAT = Duration.ofSeconds(25);
    private static final int MAX_STREAMS_PER_USER = 8;
    private static final long CLIENT_RETRY_MS = 5_000;

    private final Map<UUID, Set<SseEmitter>> streams = new ConcurrentHashMap<>();
    private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "live-events-heartbeat");
        thread.setDaemon(true);
        return thread;
    });

    public LiveEventService() {
        heartbeat.scheduleWithFixedDelay(this::sendHeartbeats, HEARTBEAT.toSeconds(), HEARTBEAT.toSeconds(), TimeUnit.SECONDS);
    }

    public SseEmitter subscribe(UUID userId) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT.toMillis());
        Set<SseEmitter> userStreams = streams.computeIfAbsent(userId, id -> new CopyOnWriteArraySet<>());
        if (userStreams.size() >= MAX_STREAMS_PER_USER) {
            userStreams.stream().findFirst().ifPresent(oldest -> {
                userStreams.remove(oldest);
                oldest.complete();
            });
        }
        userStreams.add(emitter);

        Runnable remove = () -> remove(userId, emitter);
        emitter.onCompletion(remove);
        emitter.onTimeout(() -> {
            remove.run();
            emitter.complete();
        });
        emitter.onError(error -> remove.run());

        try {
            emitter.send(SseEmitter.event().name("ready").reconnectTime(CLIENT_RETRY_MS).data(Map.of("ok", true)));
        } catch (IOException e) {
            remove.run();
        }
        return emitter;
    }

    /**
     * Sends {@code type} with a JSON {@code payload} to every open stream of the user. Inside a transaction
     * the send waits for commit, so clients never refetch state that is not visible yet.
     */
    public void publish(UUID userId, String type, Object payload) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send(userId, type, payload);
                }
            });
        } else {
            send(userId, type, payload);
        }
    }

    int openStreams(UUID userId) {
        Set<SseEmitter> userStreams = streams.get(userId);
        return userStreams == null ? 0 : userStreams.size();
    }

    private void send(UUID userId, String type, Object payload) {
        Set<SseEmitter> userStreams = streams.get(userId);
        if (userStreams == null) {
            return;
        }
        for (SseEmitter emitter : userStreams) {
            try {
                emitter.send(SseEmitter.event().name(type).data(payload, MediaType.APPLICATION_JSON));
            } catch (IOException | IllegalStateException e) {
                remove(userId, emitter);
            }
        }
    }

    private void sendHeartbeats() {
        streams.forEach((userId, userStreams) -> {
            for (SseEmitter emitter : userStreams) {
                try {
                    emitter.send(SseEmitter.event().comment("hb"));
                } catch (IOException | IllegalStateException e) {
                    remove(userId, emitter);
                }
            }
        });
    }

    private void remove(UUID userId, SseEmitter emitter) {
        streams.computeIfPresent(userId, (id, userStreams) -> {
            userStreams.remove(emitter);
            return userStreams.isEmpty() ? null : userStreams;
        });
    }

    @PreDestroy
    void shutdown() {
        heartbeat.shutdownNow();
        streams.values().forEach(userStreams -> userStreams.forEach(emitter -> {
            try {
                emitter.complete();
            } catch (Exception e) {
                log.debug("Closing live event stream failed: {}", e.getMessage());
            }
        }));
        streams.clear();
    }
}

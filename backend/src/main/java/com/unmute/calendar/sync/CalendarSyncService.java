package com.unmute.calendar.sync;

import com.unmute.ai.service.NoteJobScheduler;
import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.calendar.GoogleSettings;
import com.unmute.calendar.crypto.TokenCipher;
import com.unmute.calendar.domain.GoogleCalendarAccount;
import com.unmute.calendar.dto.AgendaResponse;
import com.unmute.calendar.dto.BlockRequest;
import com.unmute.calendar.dto.CalendarEventDto;
import com.unmute.calendar.dto.CalendarStatusResponse;
import com.unmute.calendar.google.GoogleCalendarClient;
import com.unmute.common.exception.ConflictException;
import com.unmute.common.exception.ResourceNotFoundException;
import com.unmute.live.LiveEventTypes;
import com.unmute.live.LivePublisher;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import com.unmute.task.domain.Task;
import com.unmute.task.repository.TaskRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
public class CalendarSyncService {

    private static final Logger log = LoggerFactory.getLogger(CalendarSyncService.class);

    private final CalendarAccountStore accounts;
    private final CalendarEventStore events;
    private final CalendarPuller puller;
    private final GoogleAccessTokens tokens;
    private final GoogleCalendarClient google;
    private final TokenCipher cipher;
    private final GoogleSettings settings;
    private final TaskRepository tasks;
    private final NoteRepository notes;
    private final UserRepository users;
    private final NoteJobScheduler noteJobs;
    private final LivePublisher live;
    private final SecureRandom random = new SecureRandom();

    public CalendarSyncService(
            CalendarAccountStore accounts,
            CalendarEventStore events,
            CalendarPuller puller,
            GoogleAccessTokens tokens,
            GoogleCalendarClient google,
            TokenCipher cipher,
            GoogleSettings settings,
            TaskRepository tasks,
            NoteRepository notes,
            UserRepository users,
            NoteJobScheduler noteJobs,
            LivePublisher live
    ) {
        this.accounts = accounts;
        this.events = events;
        this.puller = puller;
        this.tokens = tokens;
        this.google = google;
        this.cipher = cipher;
        this.settings = settings;
        this.tasks = tasks;
        this.notes = notes;
        this.users = users;
        this.noteJobs = noteJobs;
        this.live = live;
    }

    public CalendarStatusResponse status(UUID userId) {
        return new CalendarStatusResponse(accounts.findByUserId(userId).isPresent());
    }

    public AgendaResponse agenda(UUID userId, LocalDate day, int offsetMinutes) {
        accounts.findByUserId(userId).ifPresent(account -> {
            Instant last = account.getLastSyncedAt();
            if (last == null || last.isBefore(Instant.now().minus(2, ChronoUnit.MINUTES))) {
                try {
                    puller.pull(userId);
                } catch (RuntimeException ex) {
                    log.warn("Calendar refresh failed for user {}: {}", userId, ex.getClass().getSimpleName());
                }
            }
        });
        int minutes = Math.max(-14 * 60, Math.min(14 * 60, offsetMinutes));
        Instant start = day.atStartOfDay(ZoneOffset.ofTotalSeconds(-minutes * 60)).toInstant();
        return new AgendaResponse(events.between(userId, start, start.plus(1, ChronoUnit.DAYS)));
    }

    public CalendarEventDto block(UUID userId, BlockRequest request) {
        if (!request.end().isAfter(request.start())) {
            throw new ConflictException("The block must end after it starts");
        }
        if (accounts.findByUserId(userId).isEmpty()) {
            throw new ConflictException("Google Calendar is not connected");
        }
        Task task = tasks.findByIdAndUserId(request.taskId(), userId)
                .orElseThrow(() -> new ResourceNotFoundException("Task not found with id: " + request.taskId()));
        String access = tokens.bearer(userId);
        GoogleCalendarClient.GoogleEvent created = google.insertEvent(
                access, task.getTitle(), request.start(), request.end(), task.getId().toString());
        events.apply(userId, List.of(created));
        task.setGoogleEventId(created.id());
        task.setScheduledStart(request.start());
        task.setScheduledEnd(request.end());
        tasks.save(task);
        live.publish(userId, LiveEventTypes.CALENDAR_UPDATED, new LiveEventTypes.CalendarUpdated(true));
        return events.find(userId, created.id()).orElseThrow(
                () -> new ResourceNotFoundException("Calendar event not found with id: " + created.id()));
    }

    public UUID createMeetingNote(UUID userId, String googleEventId) {
        CalendarEventDto event = events.find(userId, googleEventId)
                .orElseThrow(() -> new ResourceNotFoundException("Calendar event not found with id: " + googleEventId));
        User user = users.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));
        Note note = new Note(user, trim(event.title(), 255), meetingBody(event));
        note.setCalendarEventId(googleEventId);
        Note saved = notes.save(note);
        noteJobs.noteChanged(saved);
        return saved.getId();
    }

    public void disconnect(UUID userId) {
        accounts.findByUserId(userId).ifPresent(account -> {
            if (account.getChannelId() != null && account.getChannelResourceId() != null) {
                try {
                    google.stop(tokens.bearer(userId), account.getChannelId().toString(), account.getChannelResourceId());
                } catch (RuntimeException ex) {
                    log.warn("Could not stop the calendar channel for user {}", userId);
                }
            }
            events.deleteAll(userId);
            accounts.delete(account);
        });
    }

    public void connect(UUID userId, GoogleCalendarClient.TokenResponse token) {
        if (token.refreshToken() == null || token.refreshToken().isBlank()) {
            throw new ConflictException("Google did not return a refresh token");
        }
        GoogleCalendarAccount account = accounts.findByUserId(userId).orElseGet(() -> new GoogleCalendarAccount(userId));
        account.setRefreshToken(cipher.encrypt(token.refreshToken()));
        account.setAccessToken(cipher.encrypt(token.accessToken()));
        account.setAccessTokenExpiresAt(Instant.now().plusSeconds(Math.max(token.expiresIn(), 60)));
        account.setSyncToken(null);
        accounts.save(account);
        if (settings.watchEnabled()) {
            registerWatch(account);
        }
    }

    @Scheduled(fixedDelay = 3_600_000L)
    public void renewChannels() {
        if (!settings.watchEnabled()) {
            return;
        }
        Instant cutoff = Instant.now().plus(24, ChronoUnit.HOURS);
        for (GoogleCalendarAccount account : accounts.channelsToRenew(cutoff)) {
            try {
                registerWatch(account);
            } catch (RuntimeException ex) {
                log.warn("Calendar channel renewal failed for user {}: {}", account.getUserId(), ex.getClass().getSimpleName());
            }
        }
    }

    private void registerWatch(GoogleCalendarAccount account) {
        String access = tokens.bearer(account.getUserId());
        if (account.getChannelId() != null && account.getChannelResourceId() != null) {
            try {
                google.stop(access, account.getChannelId().toString(), account.getChannelResourceId());
            } catch (RuntimeException ex) {
                log.warn("Could not stop the previous calendar channel for user {}", account.getUserId());
            }
        }
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String channelToken = HexFormat.of().formatHex(raw);
        UUID channelId = UUID.randomUUID();
        Instant requested = Instant.now().plus(6, ChronoUnit.DAYS);
        GoogleCalendarClient.WatchResponse watch = google.watch(
                access, channelId.toString(), channelToken, settings.getWebhookUrl(), requested);
        account.setChannelId(channelId);
        account.setChannelResourceId(watch.resourceId());
        account.setChannelTokenHash(ChannelTokens.hash(channelToken));
        account.setChannelExpiresAt(watch.expiration());
        accounts.save(account);
    }

    private static String meetingBody(CalendarEventDto event) {
        StringBuilder body = new StringBuilder();
        body.append("When: ").append(event.startsAt()).append(" – ").append(event.endsAt()).append("\n\n");
        if (event.attendees() != null && !event.attendees().isEmpty()) {
            body.append("Attendees:\n");
            for (CalendarEventDto.AttendeeDto attendee : event.attendees()) {
                String label = attendee.name() != null && !attendee.name().isBlank() ? attendee.name() : attendee.email();
                body.append("- ").append(label);
                if (attendee.email() != null && attendee.name() != null) {
                    body.append(" <").append(attendee.email()).append(">");
                }
                body.append('\n');
            }
            body.append('\n');
        }
        if (event.description() != null && !event.description().isBlank()) {
            body.append(event.description());
        }
        return body.toString().strip();
    }

    private static String trim(String value, int max) {
        if (value == null || value.isBlank()) {
            return "Meeting";
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}

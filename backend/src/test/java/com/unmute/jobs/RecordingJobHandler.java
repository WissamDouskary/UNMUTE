package com.unmute.jobs;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/** Test-only handler whose behaviour is driven by the job payload's {@code mode}. */
@Component
class RecordingJobHandler implements JobHandler {

    static final String TYPE = "TEST_RECORDING";

    final List<String> handled = new CopyOnWriteArrayList<>();
    final List<String> retried = new CopyOnWriteArrayList<>();
    final List<String> finallyFailed = new CopyOnWriteArrayList<>();

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public void handle(ClaimedJob job) {
        String mode = job.payload().path("mode").asText();
        String marker = job.payload().path("marker").asText();
        handled.add(marker);
        switch (mode) {
            case "fail-once" -> {
                if (job.attempt() == 1) {
                    throw new IllegalStateException("transient failure");
                }
            }
            case "fail-always" -> throw new IllegalStateException("still broken");
            case "fatal" -> throw new NonRetryableJobException("bad input");
            default -> {
            }
        }
    }

    @Override
    public void onRetryScheduled(ClaimedJob job, Exception error, java.time.Instant nextRunAt) {
        retried.add(job.payload().path("marker").asText());
    }

    @Override
    public void onFinalFailure(ClaimedJob job, Exception error) {
        finallyFailed.add(job.payload().path("marker").asText());
    }

    void reset() {
        handled.clear();
        retried.clear();
        finallyFailed.clear();
    }
}

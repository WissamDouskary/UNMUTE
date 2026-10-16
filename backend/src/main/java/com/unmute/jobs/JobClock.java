package com.unmute.jobs;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Database timestamps hold microseconds and round sub-microsecond input up or down. Truncating first keeps
 * a stored {@code run_at} from landing after the {@code now} a claimer reads in the same clock tick.
 */
final class JobClock {

    private JobClock() {
    }

    static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MICROS);
    }
}

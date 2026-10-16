package com.unmute.jobs;

import java.time.Instant;

/** Published inside the enqueueing transaction; the worker reacts after commit to start due work at once. */
record JobsEnqueuedEvent(Instant runAt) {
}

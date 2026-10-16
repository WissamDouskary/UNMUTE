package com.unmute.jobs;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

@ConfigurationProperties("unmute.jobs")
public record JobProperties(
        /* Polls and executes jobs. Enqueueing always works; tests drive execution with JobWorker#drain. */
        @DefaultValue("true") boolean workerEnabled,
        @DefaultValue("4") int concurrency,
        @DefaultValue("10") int batchSize,
        @DefaultValue("PT1S") Duration pollInterval,
        /* A RUNNING job whose worker has not heartbeated for this long is handed back to the queue. */
        @DefaultValue("PT2M") Duration lease,
        @DefaultValue("PT20S") Duration heartbeatInterval,
        @DefaultValue("5") int defaultMaxAttempts,
        @DefaultValue("PT10S") Duration retryBackoff,
        @DefaultValue("PT15M") Duration maxRetryBackoff,
        @DefaultValue("P7D") Duration succeededRetention,
        @DefaultValue("P30D") Duration failedRetention,
        @DefaultValue("PT20S") Duration shutdownGrace
) {
}

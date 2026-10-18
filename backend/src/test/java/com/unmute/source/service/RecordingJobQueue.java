package com.unmute.source.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.jobs.JobQueue;
import com.unmute.jobs.JobSpec;

import java.util.ArrayList;
import java.util.List;

/** Records enqueue calls without a database. Mockito cannot mock this concrete class on the JDK used here. */
final class RecordingJobQueue extends JobQueue {

    final List<JobSpec> specs = new ArrayList<>();

    RecordingJobQueue() {
        super(null, null, new ObjectMapper(), null, null);
    }

    @Override
    public void enqueue(JobSpec spec) {
        specs.add(spec);
    }

    @Override
    public boolean hasActiveJob(String type, String dedupKey) {
        return false;
    }
}

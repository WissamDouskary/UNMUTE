package com.unmute.jobs;

/** Job type identifiers persisted in {@code background_jobs.job_type}; renaming one orphans queued rows. */
public final class JobTypes {

    public static final String EMBED_NOTE = "EMBED_NOTE";
    public static final String TRANSCRIBE_SOURCE = "TRANSCRIBE_SOURCE";
    public static final String AUTO_TAG_NOTE = "AUTO_TAG_NOTE";

    private JobTypes() {
    }
}

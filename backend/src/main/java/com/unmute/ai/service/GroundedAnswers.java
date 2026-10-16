package com.unmute.ai.service;

import com.unmute.ai.dto.AskResponse;

import java.util.UUID;

/** Produces a grounded answer for a question. Chat history calls this without holding a database transaction. */
public interface GroundedAnswers {

    AskResponse ask(UUID userId, String question, int topK);
}

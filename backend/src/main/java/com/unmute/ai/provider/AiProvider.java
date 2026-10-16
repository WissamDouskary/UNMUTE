package com.unmute.ai.provider;

import com.unmute.ai.dto.ExtractedTaskItem;
import com.unmute.ai.dto.SummarizeResponse;

import java.util.List;

public interface AiProvider {

    SummarizeResponse summarize(String content);

    List<ExtractedTaskItem> extractTasks(String content);

    com.unmute.ai.dto.AskResponse generateRagAnswer(String question, java.util.List<com.unmute.ai.dto.SemanticSearchResultDto> relevantNotes);
}

package com.unmute.ai.provider;

import com.unmute.ai.dto.AskResponse;
import com.unmute.ai.dto.ExtractedTaskItem;
import com.unmute.ai.dto.SemanticSearchResultDto;
import com.unmute.ai.dto.SummarizeResponse;

import java.util.List;

public interface AiProvider {

    SummarizeResponse summarize(String content);

    List<ExtractedTaskItem> extractTasks(String content);

    AskResponse generateRagAnswer(String question, List<SemanticSearchResultDto> relevantNotes);

    /**
     * Suggests up to {@code maxTags} topical tags for a note, preferring the user's existing
     * {@code vocabulary} when it fits. Raw suggestions; callers normalize them with {@link TagNormalizer}.
     */
    List<String> suggestTags(String title, String content, List<String> vocabulary, int maxTags);
}

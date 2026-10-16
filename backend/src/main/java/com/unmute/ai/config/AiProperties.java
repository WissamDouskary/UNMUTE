package com.unmute.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * AI provider configuration. API keys come from the environment ({@code .env} via docker compose) and are
 * never logged: {@link #toString()} of the nested records masks them.
 */
@ConfigurationProperties("unmute.ai")
public record AiProperties(
        /* auto | anthropic | openai | gemini | mock. auto prefers Anthropic, then OpenAI, then Gemini, then mock. */
        @DefaultValue("auto") String llmProvider,
        /* auto | openai | gemini | mock */
        @DefaultValue("auto") String embeddingProvider,
        /* auto | openai | gemini | mock */
        @DefaultValue("auto") String transcriptionProvider,
        @DefaultValue OpenAi openai,
        @DefaultValue Anthropic anthropic,
        @DefaultValue Gemini gemini,
        @DefaultValue AutoTag autoTag
) {

    public record OpenAi(
            @DefaultValue("") String apiKey,
            @DefaultValue("https://api.openai.com/v1") String baseUrl,
            @DefaultValue("gpt-4o") String chatModel,
            @DefaultValue("text-embedding-3-small") String embeddingModel,
            @DefaultValue("whisper-1") String transcriptionModel,
            @DefaultValue("4096") int maxCompletionTokens,
            @DefaultValue("PT10S") Duration connectTimeout,
            @DefaultValue("PT120S") Duration readTimeout,
            @DefaultValue("PT10M") Duration transcriptionTimeout
    ) {
        public boolean hasKey() {
            return apiKey != null && !apiKey.isBlank();
        }

        @Override
        public String toString() {
            return "OpenAi[apiKey=" + mask(apiKey) + ", baseUrl=" + baseUrl + ", chatModel=" + chatModel
                    + ", embeddingModel=" + embeddingModel + ", transcriptionModel=" + transcriptionModel + "]";
        }
    }

    public record Anthropic(
            @DefaultValue("") String apiKey,
            @DefaultValue("https://api.anthropic.com/v1") String baseUrl,
            @DefaultValue("claude-sonnet-5-5") String model,
            /* low | medium | high; blank leaves the model default. */
            @DefaultValue("medium") String effort,
            @DefaultValue("16000") int maxTokens,
            @DefaultValue("PT10S") Duration connectTimeout,
            @DefaultValue("PT180S") Duration readTimeout
    ) {
        public boolean hasKey() {
            return apiKey != null && !apiKey.isBlank();
        }

        @Override
        public String toString() {
            return "Anthropic[apiKey=" + mask(apiKey) + ", baseUrl=" + baseUrl + ", model=" + model
                    + ", effort=" + effort + "]";
        }
    }

    public record Gemini(
            @DefaultValue("") String apiKey,
            @DefaultValue("https://generativelanguage.googleapis.com/v1beta/openai") String baseUrl,
            @DefaultValue("https://generativelanguage.googleapis.com/v1beta") String nativeBaseUrl,
            @DefaultValue("gemini-2.5-flash") String chatModel,
            @DefaultValue("gemini-embedding-001") String embeddingModel,
            @DefaultValue("gemini-2.5-flash") String transcriptionModel,
            @DefaultValue("4096") int maxCompletionTokens,
            @DefaultValue("PT10S") Duration connectTimeout,
            @DefaultValue("PT120S") Duration readTimeout,
            @DefaultValue("PT10M") Duration transcriptionTimeout
    ) {
        public boolean hasKey() {
            return apiKey != null && !apiKey.isBlank();
        }

        @Override
        public String toString() {
            return "Gemini[apiKey=" + mask(apiKey) + ", baseUrl=" + baseUrl
                    + ", chatModel=" + chatModel + ", embeddingModel=" + embeddingModel
                    + ", transcriptionModel=" + transcriptionModel + "]";
        }
    }

    public record AutoTag(
            @DefaultValue("true") boolean enabled,
            /* Waits for typing to settle so a half-written note is not tagged. */
            @DefaultValue("PT20S") Duration debounce,
            /* Plain-text characters below which a note is too thin to tag meaningfully. */
            @DefaultValue("120") int minChars,
            @DefaultValue("5") int maxTags
    ) {
    }

    static String mask(String key) {
        if (key == null || key.isBlank()) {
            return "<unset>";
        }
        return "****" + (key.length() > 8 ? key.substring(key.length() - 4) : "");
    }
}

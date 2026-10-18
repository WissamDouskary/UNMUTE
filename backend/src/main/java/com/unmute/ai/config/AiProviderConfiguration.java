package com.unmute.ai.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.ai.client.AnthropicClient;
import com.unmute.ai.client.GeminiClient;
import com.unmute.ai.client.LlmClient;
import com.unmute.ai.client.OpenAiClient;
import com.unmute.ai.provider.AiProvider;
import com.unmute.ai.provider.EmbeddingProvider;
import com.unmute.ai.provider.GeminiEmbeddingProvider;
import com.unmute.ai.provider.LlmAiProvider;
import com.unmute.ai.provider.MockAiProvider;
import com.unmute.ai.provider.MockEmbeddingProvider;
import com.unmute.ai.provider.OpenAiEmbeddingProvider;
import com.unmute.source.service.CaptureSuggester;
import com.unmute.source.service.GeminiTranscriptionService;
import com.unmute.source.service.MockTranscriptionProvider;
import com.unmute.source.service.OpenAiTranscriptionService;
import com.unmute.source.service.TranscriptionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Locale;

/**
 * Chooses the AI implementations from configuration. With {@code auto} (the default) a provider is used
 * whenever its key is present, and the offline mocks fill in otherwise, so the app runs without any keys.
 * Explicitly selecting a provider whose key is missing fails startup instead of silently degrading.
 */
@Configuration(proxyBeanMethods = false)
public class AiProviderConfiguration {

    private static final Logger log = LoggerFactory.getLogger(AiProviderConfiguration.class);

    @Bean
    AiClients aiClients(AiProperties properties, ObjectMapper mapper) {
        AiProperties.OpenAi openAi = properties.openai();
        AiProperties.Anthropic anthropic = properties.anthropic();
        AiProperties.Gemini gemini = properties.gemini();
        OpenAiClient openAiClient = openAi.hasKey()
                ? new OpenAiClient(restClient(openAi.connectTimeout(), openAi.readTimeout()),
                restClient(openAi.connectTimeout(), openAi.transcriptionTimeout()), openAi, mapper)
                : null;
        AnthropicClient anthropicClient = anthropic.hasKey()
                ? new AnthropicClient(restClient(anthropic.connectTimeout(), anthropic.readTimeout()), anthropic, mapper)
                : null;
        GeminiClient geminiClient = gemini.hasKey()
                ? new GeminiClient(restClient(gemini.connectTimeout(), gemini.readTimeout()),
                restClient(gemini.connectTimeout(), gemini.transcriptionTimeout()), gemini, mapper)
                : null;
        return new AiClients(openAiClient, anthropicClient, geminiClient);
    }

    @Bean
    CaptureSuggester captureSuggester(AiProperties properties, AiClients clients, ObjectMapper mapper) {
        boolean mock = "mock".equals(normalize(properties.llmProvider()));
        return new CaptureSuggester(selectLlm(properties, clients), mock ? null : clients.gemini(), mapper);
    }

    @Bean
    AiProvider aiProvider(AiProperties properties, AiClients clients) {
        LlmClient llm = selectLlm(properties, clients);
        if (llm == null) {
            log.info("AI text model: offline mock (set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY to use a real model)");
            return new MockAiProvider();
        }
        log.info("AI text model: {}", llm.describe());
        return new LlmAiProvider(llm);
    }

    @Bean
    EmbeddingProvider embeddingProvider(AiProperties properties, AiClients clients) {
        String choice = normalize(properties.embeddingProvider());
        EmbeddingProvider provider = switch (choice) {
            case "auto" -> clients.openAi() != null
                    ? new OpenAiEmbeddingProvider(clients.openAi())
                    : clients.gemini() != null
                            ? new GeminiEmbeddingProvider(clients.gemini())
                            : new MockEmbeddingProvider();
            case "openai" -> new OpenAiEmbeddingProvider(
                    require(clients.openAi(), "unmute.ai.embedding-provider=openai", "OPENAI_API_KEY"));
            case "gemini" -> new GeminiEmbeddingProvider(
                    require(clients.gemini(), "unmute.ai.embedding-provider=gemini", "GEMINI_API_KEY"));
            case "mock" -> new MockEmbeddingProvider();
            default -> throw unknown("embedding-provider", choice, "auto, openai, gemini, mock");
        };
        log.info("Embedding model: {}{}", provider.modelId(),
                isMock(provider) ? " (set OPENAI_API_KEY or GEMINI_API_KEY for semantic embeddings)" : "");
        return provider;
    }

    @Bean
    TranscriptionService transcriptionService(AiProperties properties, AiClients clients) {
        String choice = normalize(properties.transcriptionProvider());
        return switch (choice) {
            case "auto" -> {
                // Never silently return canned mock transcripts in auto: a missing key must fail startup
                // instead of inventing speech. Tests opt in with AI_TRANSCRIPTION_PROVIDER=mock.
                if (clients.gemini() != null) {
                    log.info("Transcription: gemini/{}", clients.gemini().properties().transcriptionModel());
                    yield new GeminiTranscriptionService(clients.gemini());
                }
                if (clients.openAi() != null) {
                    log.info("Transcription: openai/{}", clients.openAi().properties().transcriptionModel());
                    yield new OpenAiTranscriptionService(clients.openAi());
                }
                throw new IllegalStateException(
                        "unmute.ai.transcription-provider=auto requires GEMINI_API_KEY or OPENAI_API_KEY. "
                                + "Set AI_TRANSCRIPTION_PROVIDER=mock only for offline tests.");
            }
            case "openai" -> {
                OpenAiClient openAi = require(clients.openAi(), "unmute.ai.transcription-provider=openai", "OPENAI_API_KEY");
                log.info("Transcription: openai/{}", openAi.properties().transcriptionModel());
                yield new OpenAiTranscriptionService(openAi);
            }
            case "gemini" -> {
                GeminiClient gemini = require(clients.gemini(), "unmute.ai.transcription-provider=gemini", "GEMINI_API_KEY");
                log.info("Transcription: gemini/{}", gemini.properties().transcriptionModel());
                yield new GeminiTranscriptionService(gemini);
            }
            case "mock" -> {
                log.info("Transcription: offline mock with canned transcripts");
                yield new MockTranscriptionProvider();
            }
            default -> throw unknown("transcription-provider", choice, "auto, openai, gemini, mock");
        };
    }

    private static LlmClient selectLlm(AiProperties properties, AiClients clients) {
        String choice = normalize(properties.llmProvider());
        return switch (choice) {
            case "auto" -> first(clients.anthropic(), clients.openAi(), clients.gemini());
            case "anthropic" -> require(clients.anthropic(), "unmute.ai.llm-provider=anthropic", "ANTHROPIC_API_KEY");
            case "openai" -> require(clients.openAi(), "unmute.ai.llm-provider=openai", "OPENAI_API_KEY");
            case "gemini" -> require(clients.gemini(), "unmute.ai.llm-provider=gemini", "GEMINI_API_KEY");
            case "mock" -> null;
            default -> throw unknown("llm-provider", choice, "auto, anthropic, openai, gemini, mock");
        };
    }

    private static boolean isMock(EmbeddingProvider provider) {
        return provider instanceof MockEmbeddingProvider;
    }

    @SafeVarargs
    private static <T> T first(T... values) {
        for (T value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static RestClient.Builder restClient(Duration connectTimeout, Duration readTimeout) {
        HttpClient http = HttpClient.newBuilder()
                .connectTimeout(connectTimeout)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(readTimeout);
        return RestClient.builder().requestFactory(factory);
    }

    private static <T> T require(T client, String setting, String keyVariable) {
        if (client == null) {
            throw new IllegalStateException(setting + " is configured but " + keyVariable + " is not set");
        }
        return client;
    }

    private static IllegalStateException unknown(String property, String value, String allowed) {
        return new IllegalStateException("Unknown unmute.ai." + property + " '" + value + "'; expected one of " + allowed);
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? "auto" : value.strip().toLowerCase(Locale.ROOT);
    }

    /** Clients exist only for providers whose API key is configured. */
    record AiClients(OpenAiClient openAi, AnthropicClient anthropic, GeminiClient gemini) {
    }
}

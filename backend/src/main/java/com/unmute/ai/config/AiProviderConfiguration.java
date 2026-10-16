package com.unmute.ai.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.ai.client.AnthropicClient;
import com.unmute.ai.client.LlmClient;
import com.unmute.ai.client.OpenAiClient;
import com.unmute.ai.provider.AiProvider;
import com.unmute.ai.provider.EmbeddingProvider;
import com.unmute.ai.provider.LlmAiProvider;
import com.unmute.ai.provider.MockAiProvider;
import com.unmute.ai.provider.MockEmbeddingProvider;
import com.unmute.ai.provider.OpenAiEmbeddingProvider;
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
        OpenAiClient openAiClient = openAi.hasKey()
                ? new OpenAiClient(restClient(openAi.connectTimeout(), openAi.readTimeout()),
                restClient(openAi.connectTimeout(), openAi.transcriptionTimeout()), openAi, mapper)
                : null;
        AnthropicClient anthropicClient = anthropic.hasKey()
                ? new AnthropicClient(restClient(anthropic.connectTimeout(), anthropic.readTimeout()), anthropic, mapper)
                : null;
        return new AiClients(openAiClient, anthropicClient);
    }

    @Bean
    AiProvider aiProvider(AiProperties properties, AiClients clients) {
        String choice = normalize(properties.llmProvider());
        LlmClient llm = switch (choice) {
            case "auto" -> clients.anthropic() != null ? clients.anthropic() : clients.openAi();
            case "anthropic" -> require(clients.anthropic(), "unmute.ai.llm-provider=anthropic", "ANTHROPIC_API_KEY");
            case "openai" -> require(clients.openAi(), "unmute.ai.llm-provider=openai", "OPENAI_API_KEY");
            case "mock" -> null;
            default -> throw unknown("llm-provider", choice, "auto, anthropic, openai, mock");
        };
        if (llm == null) {
            log.info("AI text model: offline mock (set ANTHROPIC_API_KEY or OPENAI_API_KEY to use a real model)");
            return new MockAiProvider();
        }
        log.info("AI text model: {}", llm.describe());
        return new LlmAiProvider(llm);
    }

    @Bean
    EmbeddingProvider embeddingProvider(AiProperties properties, AiClients clients) {
        OpenAiClient openAi = openAiFor(normalize(properties.embeddingProvider()), "embedding-provider", clients);
        EmbeddingProvider provider = openAi != null ? new OpenAiEmbeddingProvider(openAi) : new MockEmbeddingProvider();
        log.info("Embedding model: {}{}", provider.modelId(),
                openAi == null ? " (set OPENAI_API_KEY for semantic embeddings)" : "");
        return provider;
    }

    @Bean
    TranscriptionService transcriptionService(AiProperties properties, AiClients clients) {
        OpenAiClient openAi = openAiFor(normalize(properties.transcriptionProvider()), "transcription-provider", clients);
        if (openAi == null) {
            log.info("Transcription: offline mock with canned transcripts (set OPENAI_API_KEY for real speech-to-text)");
            return new MockTranscriptionProvider();
        }
        log.info("Transcription: openai/{}", openAi.properties().transcriptionModel());
        return new OpenAiTranscriptionService(openAi);
    }

    private static OpenAiClient openAiFor(String choice, String property, AiClients clients) {
        return switch (choice) {
            case "auto" -> clients.openAi();
            case "openai" -> require(clients.openAi(), "unmute.ai." + property + "=openai", "OPENAI_API_KEY");
            case "mock" -> null;
            default -> throw unknown(property, choice, "auto, openai, mock");
        };
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
    record AiClients(OpenAiClient openAi, AnthropicClient anthropic) {
    }
}

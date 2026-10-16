package com.unmute.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.ai.dto.AskResponse;
import com.unmute.ai.dto.CitationDto;
import com.unmute.ai.service.GroundedAnswers;
import com.unmute.auth.dto.AuthResponse;
import com.unmute.auth.dto.RegisterRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(ChatIntegrationTest.StubAnswers.class)
class ChatIntegrationTest {

    @TestConfiguration
    static class StubAnswers {
        @Bean
        @Primary
        GroundedAnswers groundedAnswers() {
            return (userId, question, topK) -> new AskResponse(
                    "The queue is durable.",
                    List.of(new CitationDto(UUID.randomUUID(), "Roadmap", "durable jobs", 0.91))
            );
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("A chat session survives a reload and stays private to its owner")
    void persistsAThreadAndHidesItFromOtherUsers() throws Exception {
        String alice = register("alice-" + UUID.randomUUID() + "@example.com");
        String bob = register("bob-" + UUID.randomUUID() + "@example.com");

        MvcResult created = mockMvc.perform(post("/api/v1/chat/sessions")
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("New chat"))
                .andReturn();
        String sessionId = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(post("/api/v1/chat/sessions/" + sessionId + "/messages")
                        .header("Authorization", "Bearer " + alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("question", "What did I decide about the queue?"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session.title").value("What did I decide about the queue?"))
                .andExpect(jsonPath("$.userMessage.role").value("USER"))
                .andExpect(jsonPath("$.assistantMessage.role").value("ASSISTANT"))
                .andExpect(jsonPath("$.assistantMessage.content", containsString("[Note: Roadmap]")))
                .andExpect(jsonPath("$.assistantMessage.citations[0].title").value("Roadmap"));

        mockMvc.perform(get("/api/v1/chat/sessions/" + sessionId)
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages", hasSize(2)))
                .andExpect(jsonPath("$.messages[0].content").value("What did I decide about the queue?"));

        mockMvc.perform(get("/api/v1/chat/sessions")
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));

        mockMvc.perform(get("/api/v1/chat/sessions/" + sessionId)
                        .header("Authorization", "Bearer " + bob))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/v1/chat/sessions/" + sessionId)
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/chat/sessions/" + sessionId)
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("POST /api/v1/chat/sessions without a token is rejected")
    void rejectsAnonymousCreate() throws Exception {
        mockMvc.perform(post("/api/v1/chat/sessions"))
                .andExpect(status().isUnauthorized());
    }

    private String register(String email) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest(email, "password123", "Tester"))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readValue(result.getResponse().getContentAsString(), AuthResponse.class).getAccessToken();
    }
}

package com.unmute.common.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.auth.dto.AuthResponse;
import com.unmute.auth.dto.RegisterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "unmute.rate-limit.auth.capacity=2",
        "unmute.rate-limit.ai.capacity=2",
        "unmute.rate-limit.upload.capacity=2"
})
class RateLimitIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void loginAiAndUploadsReturn429AfterTheirOwnLimits() throws Exception {
        String login = "{\"email\":\"nobody@example.com\",\"password\":\"wrong-password\"}";
        mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.status", is(429)))
                .andExpect(jsonPath("$.message", containsString("Too many requests")))
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.not(containsString("wrong-password"))));

        mockMvc.perform(post("/api/v1/auth/login")
                        .with(from("203.0.113.40"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(login))
                .andExpect(status().isUnauthorized());

        String token = register("203.0.113.50", "limit-ai@example.com");
        String summary = "{\"content\":\"Call Alex tomorrow.\"}";
        mockMvc.perform(post("/api/v1/ai/summarize").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(summary))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/ai/summarize").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(summary))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/ai/summarize").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(summary))
                .andExpect(status().isTooManyRequests());

        String uploadToken = register("203.0.113.60", "limit-upload@example.com");
        emptyUpload(uploadToken, 400);
        emptyUpload(uploadToken, 400);
        emptyUpload(uploadToken, 429);

        String otherToken = register("203.0.113.70", "limit-other@example.com");
        emptyUpload(otherToken, 400);
    }

    private String register(String address, String email) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .with(from(address))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest(email, "password123", "Ada"))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readValue(result.getResponse().getContentAsString(), AuthResponse.class).getAccessToken();
    }

    private void emptyUpload(String token, int status) throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "empty.txt", "text/plain", new byte[0]);
        mockMvc.perform(multipart("/api/v1/sources").file(file).header("Authorization", "Bearer " + token))
                .andExpect(status().is(status));
    }

    private static RequestPostProcessor from(String address) {
        return request -> {
            request.setRemoteAddr(address);
            return request;
        };
    }
}

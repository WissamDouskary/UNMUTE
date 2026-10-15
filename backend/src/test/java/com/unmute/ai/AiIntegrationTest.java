package com.unmute.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.ai.dto.ExtractTasksRequest;
import com.unmute.ai.dto.ExtractTasksResponse;
import com.unmute.ai.dto.SummarizeRequest;
import com.unmute.ai.dto.SummarizeResponse;
import com.unmute.auth.dto.AuthResponse;
import com.unmute.auth.dto.RegisterRequest;
import com.unmute.note.dto.CreateNoteRequest;
import com.unmute.note.dto.NoteDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Set;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String registerAndGetToken(String email, String name) throws Exception {
        RegisterRequest registerRequest = new RegisterRequest(email, "password123", name);
        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerRequest)))
                .andExpect(status().isCreated())
                .andReturn();

        AuthResponse authResponse = objectMapper.readValue(result.getResponse().getContentAsString(), AuthResponse.class);
        return authResponse.getAccessToken();
    }

    private NoteDto createTestNote(String token, String title, String content) throws Exception {
        CreateNoteRequest request = new CreateNoteRequest(title, content, Set.of("ai-test"), false);
        MvcResult result = mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        return objectMapper.readValue(result.getResponse().getContentAsString(), NoteDto.class);
    }

    @Test
    @DisplayName("POST /api/v1/ai/summarize without token -> 401 Unauthorized")
    void shouldRejectUnauthenticatedRequest() throws Exception {
        SummarizeRequest request = new SummarizeRequest("Some note content", null);

        mockMvc.perform(post("/api/v1/ai/summarize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /api/v1/ai/summarize -> 200 OK with summary and key points")
    void shouldSummarizeNoteContent() throws Exception {
        String token = registerAndGetToken("aiuser@example.com", "AI User");
        String content = "<h1>Project Titan Kickoff</h1><p>We need to deliver the new API by Friday. The database migration is critical and must be tested thoroughly. All frontend components should follow the Tailwind design system.</p>";

        SummarizeRequest request = new SummarizeRequest(content, null);

        mockMvc.perform(post("/api/v1/ai/summarize")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary", notNullValue()))
                .andExpect(jsonPath("$.keyPoints", hasSize(greaterThanOrEqualTo(1))));
    }

    @Test
    @DisplayName("POST /api/v1/ai/extract-tasks without save -> extracts tasks without creating DB rows")
    void shouldExtractTasksWithoutSaving() throws Exception {
        String token = registerAndGetToken("extractuser@example.com", "Extract User");
        String content = "<h2>Weekly Standup</h2><ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"false\">Implement OAuth2 refresh token rotation</li><li data-type=\"taskItem\" data-checked=\"false\">URGENT: Fix production memory leak</li></ul>";

        ExtractTasksRequest request = new ExtractTasksRequest(content, null, false);

        MvcResult result = mockMvc.perform(post("/api/v1/ai/extract-tasks")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count", is(2)))
                .andExpect(jsonPath("$.tasks[0].savedTaskId").doesNotExist())
                .andReturn();

        ExtractTasksResponse response = objectMapper.readValue(result.getResponse().getContentAsString(), ExtractTasksResponse.class);
        assertTrue(response.tasks().stream().anyMatch(t -> t.priority().name().equals("URGENT")));
    }

    @Test
    @DisplayName("POST /api/v1/ai/extract-tasks with saveToTasks: true -> saves tasks directly to Tasks table")
    void shouldExtractTasksAndSaveToDatabase() throws Exception {
        String token = registerAndGetToken("saveuser@example.com", "Save User");
        NoteDto note = createTestNote(token, "Sprint Planning", "Note to extract from");

        String content = "<p>Action items for Sprint 43:</p><ul><li>TODO: Configure pgvector embedding dimensions</li><li>Must verify Tiptap slash commands</li></ul>";

        ExtractTasksRequest request = new ExtractTasksRequest(content, note.getId(), true);

        MvcResult result = mockMvc.perform(post("/api/v1/ai/extract-tasks")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count", greaterThanOrEqualTo(1)))
                .andReturn();

        ExtractTasksResponse response = objectMapper.readValue(result.getResponse().getContentAsString(), ExtractTasksResponse.class);
        assertNotNull(response.tasks().get(0).savedTaskId());

        // Verify that the task now exists in the Tasks database linked to the note
        mockMvc.perform(get("/api/v1/tasks?noteId=" + note.getId())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(response.count())))
                .andExpect(jsonPath("$[0].noteId", is(note.getId().toString())));
    }
}

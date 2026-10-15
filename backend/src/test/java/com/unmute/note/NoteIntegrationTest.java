package com.unmute.note;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.auth.dto.AuthResponse;
import com.unmute.auth.dto.RegisterRequest;
import com.unmute.note.dto.CreateNoteRequest;
import com.unmute.note.dto.UpdateNoteRequest;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class NoteIntegrationTest {

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

    @Test
    @DisplayName("POST /api/v1/notes without token -> 401 Unauthorized")
    void shouldRejectUnauthenticatedRequest() throws Exception {
        CreateNoteRequest request = new CreateNoteRequest("My Note", "Content", Set.of("idea"), false);

        mockMvc.perform(post("/api/v1/notes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /api/v1/notes -> 201 Created with note DTO")
    void shouldCreateNoteSuccessfully() throws Exception {
        String token = registerAndGetToken("author@example.com", "Author One");
        CreateNoteRequest request = new CreateNoteRequest("Architecture Plan", "Detailed microservices spec", Set.of("tech", "architecture"), true);

        mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.title", is("Architecture Plan")))
                .andExpect(jsonPath("$.content", is("Detailed microservices spec")))
                .andExpect(jsonPath("$.isPinned", is(true)))
                .andExpect(jsonPath("$.isArchived", is(false)))
                .andExpect(jsonPath("$.tags", hasItems("tech", "architecture")))
                .andExpect(jsonPath("$.createdAt", notNullValue()))
                .andExpect(jsonPath("$.updatedAt", notNullValue()));
    }

    @Test
    @DisplayName("POST /api/v1/notes with blank title -> 422 Unprocessable Entity")
    void shouldRejectBlankTitle() throws Exception {
        String token = registerAndGetToken("author2@example.com", "Author Two");
        CreateNoteRequest request = new CreateNoteRequest("", "Content without title", Set.of(), false);

        mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.status", is(422)))
                .andExpect(jsonPath("$.message", is("Validation failed")))
                .andExpect(jsonPath("$.errors.title", notNullValue()));
    }

    @Test
    @DisplayName("GET /api/v1/notes -> returns only notes belonging to authenticated user")
    void shouldEnforceUserScopingOnList() throws Exception {
        String tokenUserA = registerAndGetToken("usera@example.com", "User A");
        String tokenUserB = registerAndGetToken("userb@example.com", "User B");

        CreateNoteRequest noteA = new CreateNoteRequest("User A Private Note", "Secret", Set.of("private"), false);
        mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + tokenUserA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(noteA)))
                .andExpect(status().isCreated());

        CreateNoteRequest noteB = new CreateNoteRequest("User B Note", "Public to B only", Set.of("general"), false);
        mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + tokenUserB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(noteB)))
                .andExpect(status().isCreated());

        // User A lists notes
        mockMvc.perform(get("/api/v1/notes")
                        .header("Authorization", "Bearer " + tokenUserA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(1)))
                .andExpect(jsonPath("$.content[0].title", is("User A Private Note")));

        // User B lists notes
        mockMvc.perform(get("/api/v1/notes")
                        .header("Authorization", "Bearer " + tokenUserB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(1)))
                .andExpect(jsonPath("$.content[0].title", is("User B Note")));
    }

    @Test
    @DisplayName("GET /api/v1/notes?search=keyword -> returns matching notes")
    void shouldSearchNotesByKeyword() throws Exception {
        String token = registerAndGetToken("searcher@example.com", "Searcher");

        mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateNoteRequest("Quarterly Objectives", "Execute sprint 4 and deploy AI engine", Set.of(), false))))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateNoteRequest("Grocery List", "Milk, bread, eggs", Set.of(), false))))
                .andExpect(status().isCreated());

        // Search for "Objectives"
        mockMvc.perform(get("/api/v1/notes?search=Objectives")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(1)))
                .andExpect(jsonPath("$.content[0].title", is("Quarterly Objectives")));

        // Search for "deploy" in content
        mockMvc.perform(get("/api/v1/notes?search=deploy")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(1)))
                .andExpect(jsonPath("$.content[0].title", is("Quarterly Objectives")));
    }

    @Test
    @DisplayName("PUT /api/v1/notes/{id} -> updates note successfully")
    void shouldUpdateNote() throws Exception {
        String token = registerAndGetToken("editor@example.com", "Editor");

        MvcResult createResult = mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateNoteRequest("Draft 1", "Initial draft", Set.of("v1"), false))))
                .andExpect(status().isCreated())
                .andReturn();

        String noteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        UpdateNoteRequest updateRequest = new UpdateNoteRequest("Draft 2 Final", "Refined content", "Summary of draft", Set.of("v2", "final"), true, false);

        mockMvc.perform(put("/api/v1/notes/" + noteId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(noteId)))
                .andExpect(jsonPath("$.title", is("Draft 2 Final")))
                .andExpect(jsonPath("$.content", is("Refined content")))
                .andExpect(jsonPath("$.summary", is("Summary of draft")))
                .andExpect(jsonPath("$.isPinned", is(true)))
                .andExpect(jsonPath("$.tags", hasItems("v2", "final")));
    }

    @Test
    @DisplayName("PATCH /api/v1/notes/{id}/archive and /pin -> toggles states")
    void shouldToggleArchiveAndPin() throws Exception {
        String token = registerAndGetToken("toggler@example.com", "Toggler");

        MvcResult createResult = mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateNoteRequest("Note to toggle", "Body", Set.of(), false))))
                .andExpect(status().isCreated())
                .andReturn();

        String noteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        // Pin note
        mockMvc.perform(patch("/api/v1/notes/" + noteId + "/pin")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isPinned", is(true)));

        // Archive note
        mockMvc.perform(patch("/api/v1/notes/" + noteId + "/archive")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isArchived", is(true)));

        // Active list should be empty
        mockMvc.perform(get("/api/v1/notes?archived=false")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(0)));

        // Archived list should contain 1
        mockMvc.perform(get("/api/v1/notes?archived=true")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(1)));
    }

    @Test
    @DisplayName("DELETE /api/v1/notes/{id} -> 204 No Content and subsequent 404")
    void shouldDeleteNote() throws Exception {
        String token = registerAndGetToken("deleter@example.com", "Deleter");

        MvcResult createResult = mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateNoteRequest("To be deleted", "Bye", Set.of(), false))))
                .andExpect(status().isCreated())
                .andReturn();

        String noteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(delete("/api/v1/notes/" + noteId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());

        // Subsequent GET should return 404
        mockMvc.perform(get("/api/v1/notes/" + noteId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /api/v1/notes/{id} for note owned by another user -> 404 Not Found")
    void shouldPreventAccessToAnotherUsersNote() throws Exception {
        String tokenUserA = registerAndGetToken("alice_notes@example.com", "Alice");
        String tokenUserB = registerAndGetToken("bob_notes@example.com", "Bob");

        MvcResult createResult = mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + tokenUserA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateNoteRequest("Alice Secret Note", "Top Secret", Set.of(), false))))
                .andExpect(status().isCreated())
                .andReturn();

        String noteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        // Bob tries to access Alice's note
        mockMvc.perform(get("/api/v1/notes/" + noteId)
                        .header("Authorization", "Bearer " + tokenUserB))
                .andExpect(status().isNotFound());
    }
}

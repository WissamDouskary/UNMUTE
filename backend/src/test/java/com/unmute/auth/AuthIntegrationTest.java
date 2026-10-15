package com.unmute.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.auth.dto.AuthResponse;
import com.unmute.auth.dto.LoginRequest;
import com.unmute.auth.dto.RefreshTokenRequest;
import com.unmute.auth.dto.RegisterRequest;
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

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("POST /api/v1/auth/register -> 201 with access and refresh tokens")
    void shouldRegisterNewUser() throws Exception {
        RegisterRequest request = new RegisterRequest("newuser@example.com", "password123", "New User");

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken", notNullValue()))
                .andExpect(jsonPath("$.refreshToken", notNullValue()))
                .andExpect(jsonPath("$.tokenType", is("Bearer")))
                .andExpect(jsonPath("$.user.email", is("newuser@example.com")))
                .andExpect(jsonPath("$.user.displayName", is("New User")))
                .andExpect(jsonPath("$.user.id", notNullValue()));
    }

    @Test
    @DisplayName("POST /api/v1/auth/register with duplicate email -> 409 Conflict")
    void shouldRejectDuplicateEmail() throws Exception {
        RegisterRequest request = new RegisterRequest("duplicate@example.com", "password123", "First User");

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());

        RegisterRequest duplicate = new RegisterRequest("duplicate@example.com", "differentpass", "Second User");

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(duplicate)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status", is(409)))
                .andExpect(jsonPath("$.message", containsString("already registered")));
    }

    @Test
    @DisplayName("POST /api/v1/auth/register with invalid data -> 422 Unprocessable Entity")
    void shouldRejectInvalidRegistrationData() throws Exception {
        RegisterRequest invalid = new RegisterRequest("not-an-email", "short", "");

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalid)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.status", is(422)))
                .andExpect(jsonPath("$.errors.email", notNullValue()))
                .andExpect(jsonPath("$.errors.password", notNullValue()))
                .andExpect(jsonPath("$.errors.displayName", notNullValue()));
    }

    @Test
    @DisplayName("POST /api/v1/auth/login -> 200 with tokens")
    void shouldLoginSuccessfully() throws Exception {
        RegisterRequest register = new RegisterRequest("login@example.com", "securepassword123", "Login User");
        mockMvc.perform(post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(register)));

        LoginRequest login = new LoginRequest("login@example.com", "securepassword123");

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(login)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken", notNullValue()))
                .andExpect(jsonPath("$.refreshToken", notNullValue()))
                .andExpect(jsonPath("$.user.email", is("login@example.com")));
    }

    @Test
    @DisplayName("POST /api/v1/auth/login with invalid password -> 401 Unauthorized")
    void shouldRejectInvalidPassword() throws Exception {
        RegisterRequest register = new RegisterRequest("wrongpass@example.com", "correctpassword123", "User");
        mockMvc.perform(post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(register)));

        LoginRequest wrong = new LoginRequest("wrongpass@example.com", "wrongpassword");

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(wrong)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status", is(401)))
                .andExpect(jsonPath("$.message", is("Invalid email or password")));
    }

    @Test
    @DisplayName("GET /api/v1/users/me with valid Bearer token -> 200 with user profile")
    void shouldAccessMeEndpointWithValidToken() throws Exception {
        RegisterRequest register = new RegisterRequest("me@example.com", "mepassword123", "Me User");
        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(register)))
                .andReturn();

        AuthResponse authResponse = objectMapper.readValue(result.getResponse().getContentAsString(), AuthResponse.class);

        mockMvc.perform(get("/api/v1/users/me")
                        .header("Authorization", "Bearer " + authResponse.getAccessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email", is("me@example.com")))
                .andExpect(jsonPath("$.displayName", is("Me User")))
                .andExpect(jsonPath("$.id", is(authResponse.getUser().getId().toString())));
    }

    @Test
    @DisplayName("GET /api/v1/users/me without token -> 401 Unauthorized")
    void shouldRejectMeWithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/users/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status", is(401)));
    }

    @Test
    @DisplayName("POST /api/v1/auth/refresh -> 200 with rotated tokens")
    void shouldRefreshTokenSuccessfully() throws Exception {
        RegisterRequest register = new RegisterRequest("refresh@example.com", "refreshpass123", "Refresh User");
        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(register)))
                .andReturn();

        AuthResponse authResponse = objectMapper.readValue(result.getResponse().getContentAsString(), AuthResponse.class);

        RefreshTokenRequest refreshReq = new RefreshTokenRequest(authResponse.getRefreshToken());

        MvcResult refreshResult = mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(refreshReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken", notNullValue()))
                .andExpect(jsonPath("$.refreshToken", notNullValue()))
                .andReturn();

        AuthResponse newAuthResponse = objectMapper.readValue(refreshResult.getResponse().getContentAsString(), AuthResponse.class);

        // Previous refresh token is now revoked (token rotation)
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(refreshReq)))
                .andExpect(status().isUnauthorized());

        // New access token works
        mockMvc.perform(get("/api/v1/users/me")
                        .header("Authorization", "Bearer " + newAuthResponse.getAccessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email", is("refresh@example.com")));
    }

    @Test
    @DisplayName("POST /api/v1/auth/logout -> 204 and revokes refresh token")
    void shouldLogoutSuccessfully() throws Exception {
        RegisterRequest register = new RegisterRequest("logout@example.com", "logoutpass123", "Logout User");
        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(register)))
                .andReturn();

        AuthResponse authResponse = objectMapper.readValue(result.getResponse().getContentAsString(), AuthResponse.class);

        RefreshTokenRequest logoutReq = new RefreshTokenRequest(authResponse.getRefreshToken());

        mockMvc.perform(post("/api/v1/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(logoutReq)))
                .andExpect(status().isNoContent());

        // Trying to refresh with the logged out token fails
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(logoutReq)))
                .andExpect(status().isUnauthorized());
    }
}

package com.unmute.auth.service;

import com.unmute.auth.domain.RefreshToken;
import com.unmute.auth.domain.User;
import com.unmute.auth.dto.*;
import com.unmute.auth.repository.RefreshTokenRepository;
import com.unmute.auth.repository.UserRepository;
import com.unmute.auth.security.JwtTokenProvider;
import com.unmute.common.exception.DuplicateEmailException;
import com.unmute.common.exception.InvalidCredentialsException;
import com.unmute.common.exception.InvalidTokenException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    public AuthService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordEncoder passwordEncoder,
            JwtTokenProvider tokenProvider) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
    }

    public AuthResponse register(RegisterRequest request) {
        String normalizedEmail = request.getEmail().trim().toLowerCase();

        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new DuplicateEmailException("Email is already registered: " + normalizedEmail);
        }

        String hashedPassword = passwordEncoder.encode(request.getPassword());
        User user = new User(normalizedEmail, hashedPassword, request.getDisplayName().trim());
        user = userRepository.save(user);

        return createAuthResponse(user);
    }

    public AuthResponse login(LoginRequest request) {
        String normalizedEmail = request.getEmail().trim().toLowerCase();

        User user = userRepository.findByEmailIgnoreCase(normalizedEmail)
                .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new InvalidCredentialsException("Invalid email or password");
        }

        return createAuthResponse(user);
    }

    public AuthResponse refresh(RefreshTokenRequest request) {
        String tokenHash = tokenProvider.hashToken(request.getRefreshToken());

        RefreshToken refreshToken = refreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new InvalidTokenException("Invalid or expired refresh token"));

        if (!refreshToken.isValid()) {
            throw new InvalidTokenException("Refresh token has been revoked or expired");
        }

        // Revoke the used refresh token (token rotation)
        refreshToken.setRevoked(true);
        refreshTokenRepository.save(refreshToken);

        User user = refreshToken.getUser();
        return createAuthResponse(user);
    }

    public void logout(String rawRefreshToken) {
        if (rawRefreshToken != null && !rawRefreshToken.isBlank()) {
            String tokenHash = tokenProvider.hashToken(rawRefreshToken.trim());
            refreshTokenRepository.revokeByTokenHash(tokenHash);
        }
    }

    @Transactional(readOnly = true)
    public UserDto getCurrentUser(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new InvalidTokenException("User not found with id: " + userId));
        return UserDto.fromEntity(user);
    }

    private AuthResponse createAuthResponse(User user) {
        String accessToken = tokenProvider.generateAccessToken(user);
        String rawRefreshToken = tokenProvider.generateRawRefreshToken();
        String tokenHash = tokenProvider.hashToken(rawRefreshToken);

        Instant expiresAt = Instant.now().plusSeconds(tokenProvider.getRefreshTokenExpirySeconds());
        RefreshToken refreshToken = new RefreshToken(user, tokenHash, expiresAt);
        refreshTokenRepository.save(refreshToken);

        return new AuthResponse(
                accessToken,
                rawRefreshToken,
                tokenProvider.getAccessTokenExpirySeconds(),
                UserDto.fromEntity(user)
        );
    }
}

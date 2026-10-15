package com.unmute.auth.controller;

import com.unmute.auth.dto.UserDto;
import com.unmute.auth.security.UserPrincipal;
import com.unmute.auth.service.AuthService;
import com.unmute.common.exception.InvalidTokenException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final AuthService authService;

    public UserController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/me")
    public ResponseEntity<UserDto> getCurrentUser(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        UserDto user = authService.getCurrentUser(principal.getId());
        return ResponseEntity.ok(user);
    }
}

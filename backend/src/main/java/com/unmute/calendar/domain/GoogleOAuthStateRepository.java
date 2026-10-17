package com.unmute.calendar.domain;

import org.springframework.data.jpa.repository.JpaRepository;

public interface GoogleOAuthStateRepository extends JpaRepository<GoogleOAuthState, String> {
}

package com.unmute.calendar.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GoogleCalendarAccountRepository extends JpaRepository<GoogleCalendarAccount, UUID> {

    Optional<GoogleCalendarAccount> findByChannelId(UUID channelId);

    @Query("""
            SELECT a FROM GoogleCalendarAccount a
            WHERE a.channelExpiresAt IS NULL OR a.channelExpiresAt < :cutoff
            """)
    List<GoogleCalendarAccount> findChannelsToRenew(@Param("cutoff") Instant cutoff);
}

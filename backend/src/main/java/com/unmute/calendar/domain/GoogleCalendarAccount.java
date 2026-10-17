package com.unmute.calendar.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "google_calendar_accounts")
public class GoogleCalendarAccount {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "refresh_token", nullable = false)
    private byte[] refreshToken;

    @Column(name = "access_token")
    private byte[] accessToken;

    @Column(name = "access_token_expires_at")
    private Instant accessTokenExpiresAt;

    @Column(name = "sync_token", columnDefinition = "TEXT")
    private String syncToken;

    @Column(name = "channel_id")
    private UUID channelId;

    @Column(name = "channel_resource_id", length = 512)
    private String channelResourceId;

    @Column(name = "channel_token_hash", length = 128)
    private String channelTokenHash;

    @Column(name = "channel_expires_at")
    private Instant channelExpiresAt;

    @Column(name = "last_synced_at")
    private Instant lastSyncedAt;

    public GoogleCalendarAccount() {
    }

    public GoogleCalendarAccount(UUID userId) {
        this.userId = userId;
    }

    public UUID getUserId() {
        return userId;
    }

    public byte[] getRefreshToken() {
        return refreshToken;
    }

    public void setRefreshToken(byte[] refreshToken) {
        this.refreshToken = refreshToken;
    }

    public byte[] getAccessToken() {
        return accessToken;
    }

    public void setAccessToken(byte[] accessToken) {
        this.accessToken = accessToken;
    }

    public Instant getAccessTokenExpiresAt() {
        return accessTokenExpiresAt;
    }

    public void setAccessTokenExpiresAt(Instant accessTokenExpiresAt) {
        this.accessTokenExpiresAt = accessTokenExpiresAt;
    }

    public String getSyncToken() {
        return syncToken;
    }

    public void setSyncToken(String syncToken) {
        this.syncToken = syncToken;
    }

    public UUID getChannelId() {
        return channelId;
    }

    public void setChannelId(UUID channelId) {
        this.channelId = channelId;
    }

    public String getChannelResourceId() {
        return channelResourceId;
    }

    public void setChannelResourceId(String channelResourceId) {
        this.channelResourceId = channelResourceId;
    }

    public String getChannelTokenHash() {
        return channelTokenHash;
    }

    public void setChannelTokenHash(String channelTokenHash) {
        this.channelTokenHash = channelTokenHash;
    }

    public Instant getChannelExpiresAt() {
        return channelExpiresAt;
    }

    public void setChannelExpiresAt(Instant channelExpiresAt) {
        this.channelExpiresAt = channelExpiresAt;
    }

    public Instant getLastSyncedAt() {
        return lastSyncedAt;
    }

    public void setLastSyncedAt(Instant lastSyncedAt) {
        this.lastSyncedAt = lastSyncedAt;
    }
}

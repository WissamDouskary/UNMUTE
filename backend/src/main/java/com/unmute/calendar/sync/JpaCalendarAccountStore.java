package com.unmute.calendar.sync;

import com.unmute.calendar.domain.GoogleCalendarAccount;
import com.unmute.calendar.domain.GoogleCalendarAccountRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JpaCalendarAccountStore implements CalendarAccountStore {

    private final GoogleCalendarAccountRepository accounts;

    public JpaCalendarAccountStore(GoogleCalendarAccountRepository accounts) {
        this.accounts = accounts;
    }

    @Override
    public Optional<GoogleCalendarAccount> findByUserId(UUID userId) {
        return accounts.findById(userId);
    }

    @Override
    public Optional<GoogleCalendarAccount> findByChannelId(UUID channelId) {
        return accounts.findByChannelId(channelId);
    }

    @Override
    public GoogleCalendarAccount save(GoogleCalendarAccount account) {
        return accounts.save(account);
    }

    @Override
    public void delete(GoogleCalendarAccount account) {
        accounts.delete(account);
    }

    @Override
    public List<GoogleCalendarAccount> channelsToRenew(Instant cutoff) {
        return accounts.findChannelsToRenew(cutoff);
    }
}

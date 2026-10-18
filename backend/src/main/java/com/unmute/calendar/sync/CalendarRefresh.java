package com.unmute.calendar.sync;

import java.util.UUID;

public interface CalendarRefresh {

    void refreshIfStale(UUID userId);
}

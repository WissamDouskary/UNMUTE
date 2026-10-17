package com.unmute.calendar.google;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.unmute.calendar.GoogleSettings;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

@Component
public class GoogleCalendarHttpClient implements GoogleCalendarClient {

    private static final String TOKEN_URL = "https://oauth2.googleapis.com/token";
    private static final String EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

    private final GoogleSettings settings;
    private final ObjectMapper json;
    private final RestClient http = RestClient.create();

    public GoogleCalendarHttpClient(GoogleSettings settings, ObjectMapper json) {
        this.settings = settings;
        this.json = json;
    }

    @Override
    public TokenResponse exchangeCode(String code) {
        return token(form(
                "grant_type", "authorization_code",
                "code", code,
                "client_id", settings.getClientId(),
                "client_secret", settings.getClientSecret(),
                "redirect_uri", settings.getRedirectUri()));
    }

    @Override
    public TokenResponse refresh(String refreshToken) {
        return token(form(
                "grant_type", "refresh_token",
                "refresh_token", refreshToken,
                "client_id", settings.getClientId(),
                "client_secret", settings.getClientSecret()));
    }

    @Override
    public ListWindow listEvents(String accessToken, String syncToken, Instant timeMin, Instant timeMax) {
        List<GoogleEvent> events = new ArrayList<>();
        String page = null;
        String nextSync = null;
        for (int i = 0; i < 10; i++) {
            JsonNode body = getEvents(accessToken, syncToken, timeMin, timeMax, page);
            for (JsonNode item : body.path("items")) {
                GoogleEvent event = readEvent(item);
                if (event != null) {
                    events.add(event);
                }
            }
            if (body.path("nextSyncToken").isTextual()) {
                nextSync = body.path("nextSyncToken").asText();
            }
            if (!body.path("nextPageToken").isTextual()) {
                break;
            }
            page = body.path("nextPageToken").asText();
        }
        return new ListWindow(events, nextSync);
    }

    @Override
    public GoogleEvent insertEvent(String accessToken, String summary, Instant start, Instant end, String taskId) {
        ObjectNode body = json.createObjectNode();
        body.put("summary", summary == null || summary.isBlank() ? "Task" : summary);
        body.set("start", dateTime(start));
        body.set("end", dateTime(end));
        ObjectNode privateProps = json.createObjectNode();
        privateProps.put("unmuteTaskId", taskId);
        ObjectNode extended = json.createObjectNode();
        extended.set("private", privateProps);
        body.set("extendedProperties", extended);
        JsonNode created = postJson(EVENTS_URL, accessToken, body);
        GoogleEvent event = readEvent(created);
        if (event == null) {
            throw new CalendarProviderException("Google Calendar did not return the created event");
        }
        return event;
    }

    @Override
    public WatchResponse watch(String accessToken, String channelId, String token, String address, Instant expiration) {
        ObjectNode body = json.createObjectNode();
        body.put("id", channelId);
        body.put("type", "web_hook");
        body.put("address", address);
        body.put("token", token);
        body.put("expiration", Long.toString(expiration.toEpochMilli()));
        JsonNode created = postJson(EVENTS_URL + "/watch", accessToken, body);
        String resourceId = created.path("resourceId").asText(null);
        if (resourceId == null) {
            throw new CalendarProviderException("Google Calendar did not return a channel");
        }
        Instant expires = expiration;
        if (created.path("expiration").isTextual()) {
            expires = Instant.ofEpochMilli(Long.parseLong(created.path("expiration").asText()));
        }
        return new WatchResponse(resourceId, expires);
    }

    @Override
    public void stop(String accessToken, String channelId, String resourceId) {
        ObjectNode body = json.createObjectNode();
        body.put("id", channelId);
        body.put("resourceId", resourceId);
        http.post()
                .uri("https://www.googleapis.com/calendar/v3/channels/stop")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body.toString())
                .retrieve()
                .onStatus(status -> status.value() == 404, (request, response) -> {
                })
                .onStatus(status -> status.isError(), (request, response) -> {
                    throw new CalendarProviderException("Google Calendar rejected a channel stop");
                })
                .toBodilessEntity();
    }

    private TokenResponse token(String form) {
        requireConfigured();
        JsonNode body = http.post()
                .uri(TOKEN_URL)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .onStatus(status -> status.isError(), (request, response) -> {
                    throw new CalendarProviderException("Google token exchange failed");
                })
                .body(JsonNode.class);
        if (body == null || !body.path("access_token").isTextual()) {
            throw new CalendarProviderException("Google token exchange failed");
        }
        String refresh = body.path("refresh_token").isTextual() ? body.path("refresh_token").asText() : null;
        return new TokenResponse(body.path("access_token").asText(), refresh, body.path("expires_in").asLong(3600));
    }

    private JsonNode getEvents(String accessToken, String syncToken, Instant timeMin, Instant timeMax, String page) {
        StringBuilder url = new StringBuilder(EVENTS_URL).append("?showDeleted=true");
        if (syncToken != null && !syncToken.isBlank()) {
            url.append("&syncToken=").append(encode(syncToken));
        } else {
            url.append("&singleEvents=true&orderBy=startTime");
            if (timeMin != null) {
                url.append("&timeMin=").append(encode(timeMin.toString()));
            }
            if (timeMax != null) {
                url.append("&timeMax=").append(encode(timeMax.toString()));
            }
        }
        if (page != null) {
            url.append("&pageToken=").append(encode(page));
        }
        return http.get()
                .uri(url.toString())
                .header("Authorization", "Bearer " + accessToken)
                .retrieve()
                .onStatus(status -> status.value() == 410, (request, response) -> {
                    throw new SyncTokenExpiredException();
                })
                .onStatus(status -> status.isError(), (request, response) -> {
                    throw new CalendarProviderException("Google Calendar event list failed");
                })
                .body(JsonNode.class);
    }

    private JsonNode postJson(String url, String accessToken, ObjectNode body) {
        JsonNode response = http.post()
                .uri(url)
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body.toString())
                .retrieve()
                .onStatus(status -> status.isError(), (request, responseEntity) -> {
                    throw new CalendarProviderException("Google Calendar rejected the request");
                })
                .body(JsonNode.class);
        if (response == null) {
            throw new CalendarProviderException("Google Calendar rejected the request");
        }
        return response;
    }

    private ObjectNode dateTime(Instant instant) {
        ObjectNode node = json.createObjectNode();
        node.put("dateTime", instant.toString());
        node.put("timeZone", "UTC");
        return node;
    }

    private GoogleEvent readEvent(JsonNode item) {
        if (!item.path("id").isTextual()) {
            return null;
        }
        if ("cancelled".equals(item.path("status").asText())) {
            String cancelledTask = item.path("extendedProperties").path("private").path("unmuteTaskId").asText(null);
            return new GoogleEvent(item.path("id").asText(), "(No title)", Instant.EPOCH, Instant.EPOCH,
                    null, null, "cancelled", List.of(), cancelledTask);
        }
        Instant start = readTime(item.path("start"));
        Instant end = readTime(item.path("end"));
        if (start == null) {
            return null;
        }
        if (end == null) {
            end = start.plusSeconds(3600);
        }
        List<GoogleEvent.Attendee> attendees = new ArrayList<>();
        for (JsonNode attendee : item.path("attendees")) {
            if (attendee.path("email").isTextual()) {
                String name = attendee.path("displayName").isTextual() ? attendee.path("displayName").asText() : null;
                attendees.add(new GoogleEvent.Attendee(attendee.path("email").asText(), name));
            }
        }
        String taskId = item.path("extendedProperties").path("private").path("unmuteTaskId").asText(null);
        String title = item.path("summary").asText("(No title)");
        String description = item.path("description").isTextual() ? item.path("description").asText() : null;
        String link = item.path("htmlLink").isTextual() ? item.path("htmlLink").asText() : null;
        return new GoogleEvent(
                item.path("id").asText(),
                title,
                start,
                end,
                description,
                link,
                item.path("status").asText("confirmed"),
                attendees,
                taskId);
    }

    private static Instant readTime(JsonNode node) {
        if (node.path("dateTime").isTextual()) {
            return OffsetDateTime.parse(node.path("dateTime").asText()).toInstant();
        }
        if (node.path("date").isTextual()) {
            return LocalDate.parse(node.path("date").asText()).atStartOfDay(ZoneOffset.UTC).toInstant();
        }
        return null;
    }

    private void requireConfigured() {
        if (!settings.configured()) {
            throw new CalendarProviderException("Google Calendar is not configured");
        }
    }

    private static String form(String... pairs) {
        StringBuilder body = new StringBuilder();
        for (int i = 0; i < pairs.length; i += 2) {
            if (i > 0) {
                body.append('&');
            }
            body.append(encode(pairs[i])).append('=').append(encode(pairs[i + 1] == null ? "" : pairs[i + 1]));
        }
        return body.toString();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}

# Google Calendar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Connect a user's Google Calendar to UNMUTE so the day view reads their events, a dropped task becomes a calendar event, and an external edit shows up in the open app.

**Architecture:** The backend owns the OAuth client secret and the refresh token. Google push notifications hit a public webhook, which runs an incremental sync and publishes `calendar.updated` on the existing per-user SSE stream (`GET /api/v1/events`). The React page reads a cached agenda and creates events only after an explicit drop or an explicit "Add to calendar" confirmation. The model proposes timed events; it does not call Google.

**Tech Stack:** Spring Boot 3.4, Flyway `V11`, `RestClient` against Google's OAuth and Calendar HTTP APIs, React 19, TanStack Query, the existing SSE client in `packages/api-client`.

**Spec:** Calendar directive dated 2026-10-17. Scope is exactly `https://www.googleapis.com/auth/calendar.events`. Theme is zinc-950 / zinc-900 / zinc-800, primary actions `bg-zinc-100 text-zinc-950`.

## Global Constraints

- Routes live under `/api/v1` so they match `SecurityConfig` and the Vite `/api` proxy. The shorthand `/api/auth/google` and `/api/webhooks/calendar` would either miss the public matcher or require a JWT Google does not send.
- Public routes, and only these: `GET /api/v1/auth/google/callback`, `POST /api/v1/webhooks/calendar`.
- Scope string is `https://www.googleapis.com/auth/calendar.events`. `access_type=offline`. `prompt=consent`.
- Refresh tokens are AES-256-GCM ciphertext. The API never returns them. Logs never include them.
- Keys come from the environment: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CALENDAR_WEBHOOK_URL`. Blank client id means Calendar stays disconnected. Do not commit `.env`.
- Live updates reuse `LiveEventService.publish`. There is no WebSocket server.
- A clock time becomes a proposed calendar event. A date with no time stays a task. Nothing is written to Google until the user confirms.
- UI stays zinc. No Google-blue button, no violet laser on this page. Focus ring stays `focus:ring-zinc-700`.

## Review Focus

- A forged callback `state` must not attach a Google account to a user. Test: expired, tampered, and replayed state are rejected.
- A webhook without the stored channel token must not sync or emit an event. Test: wrong `X-Goog-Channel-Token` returns 200 and does not publish (Google retries non-2xx).
- User A's channel id must not update user B's agenda. Test: token matches only the row that owns that channel.
- `GET /api/v1/calendar/agenda` must not include ciphertext or the refresh token.
- An extract result with `kind=EVENT` must not create a Google event by itself.

---

### Task 1: Schema and token cipher

**Files:**
- Create: `backend/src/main/resources/db/migration/V11__google_calendar.sql`
- Create: `backend/src/main/java/com/unmute/calendar/crypto/TokenCipher.java`
- Test: `backend/src/test/java/com/unmute/calendar/crypto/TokenCipherTest.java`

**Interfaces:**
- Consumes: `GOOGLE_TOKEN_ENCRYPTION_KEY` as base64 of 32 bytes
- Produces: `TokenCipher.encrypt(String plaintext) -> byte[]` packed as `iv(12) || ciphertext || tag`. `TokenCipher.decrypt(byte[]) -> String`.

- [x] **Step 1: Write the failing cipher test**

Assert a round trip, and assert tampering one ciphertext byte throws.

- [x] **Step 2: Run `TokenCipherTest` and confirm it fails to compile**

- [x] **Step 3: Implement `TokenCipher` with AES-256-GCM**

- [x] **Step 4: Add `V11__google_calendar.sql`**

Tables:

- `google_calendar_accounts`: `user_id` PK references `users(id)` on delete cascade, `refresh_token bytea not null`, `access_token bytea`, `access_token_expires_at timestamptz`, `sync_token text`, `channel_id uuid`, `channel_resource_id text`, `channel_token_hash text`, `channel_expires_at timestamptz`, `last_synced_at timestamptz`.
- `google_oauth_states`: `nonce_hash text` PK, `user_id uuid not null`, `expires_at timestamptz not null`.
- `calendar_events`: `id uuid` PK, `user_id uuid not null`, `google_event_id text not null`, `title text not null`, `starts_at timestamptz not null`, `ends_at timestamptz not null`, `attendees jsonb not null default '[]'`, `description text`, `html_link text`, `status text not null`, unique `(user_id, google_event_id)`.
- `tasks`: add nullable `google_event_id text`, `scheduled_start timestamptz`, `scheduled_end timestamptz`.
- `notes`: add nullable `calendar_event_id text`.

- [x] **Step 5: Run `TokenCipherTest` and confirm it passes**

### Task 2: OAuth start and callback

**Files:**
- Create: `backend/src/main/java/com/unmute/calendar/web/GoogleOAuthController.java`
- Create: `backend/src/main/java/com/unmute/calendar/oauth/OAuthStateService.java`
- Modify: `backend/src/main/java/com/unmute/common/config/SecurityConfig.java`
- Test: `backend/src/test/java/com/unmute/calendar/oauth/OAuthStateServiceTest.java`

**Interfaces:**
- Consumes: `TokenCipher`, the signed-in `UserPrincipal`
- Produces: `GET /api/v1/auth/google/start` → `{ "url": string }`. `GET /api/v1/auth/google/callback?code&state` → redirect to `{WEB_ORIGIN}/calendar?connected=1` or `?connected=0`.

- [x] **Step 1: Write `OAuthStateServiceTest`**

Issue a state for a user id. Accept it once. Reject the second accept, a flipped signature byte, and a state older than 10 minutes.

- [x] **Step 2: Run that test and confirm it fails**

- [x] **Step 3: Implement the state service and the two routes**

Start requires a JWT. It stores a single-use nonce and returns the Google authorization URL with the scope, `access_type=offline`, and `prompt=consent`.

Callback is `permitAll`. It checks the state, posts the code to `https://oauth2.googleapis.com/token`, encrypts the refresh token, and upserts `google_calendar_accounts`. A missing `refresh_token` redirects with `connected=0`.

Add the callback matcher next to `/api/v1/auth/**` in `SecurityConfig`. Do not make all of `/api/v1/calendar/**` public.

- [x] **Step 4: Run the state test and confirm it passes**

### Task 3: Agenda read, time-block write, meeting note

**Files:**
- Create: `backend/src/main/java/com/unmute/calendar/web/CalendarController.java`
- Create: `backend/src/main/java/com/unmute/calendar/google/GoogleCalendarClient.java`
- Create: `backend/src/main/java/com/unmute/calendar/CalendarSyncService.java`
- Modify: `packages/api-client/src/client.ts`
- Modify: `packages/api-client/src/types.ts`

**Interfaces:**
- Consumes: `TokenCipher`, task and note repositories
- Produces:
  - `GET /api/v1/calendar/status` → `{ connected: boolean }`
  - `GET /api/v1/calendar/agenda?day=YYYY-MM-DD` → `{ events: CalendarEvent[] }`
  - `POST /api/v1/calendar/blocks` body `{ taskId: uuid, start: instant, end: instant }` → the created `CalendarEvent`
  - `POST /api/v1/calendar/events/{googleEventId}/notes` → `{ noteId: uuid }`
  - `DELETE /api/v1/calendar/connection`

`CalendarEvent` fields: `googleEventId`, `title`, `startsAt`, `endsAt`, `attendees: { email, name }[]`, `description`, `htmlLink`, `status`, `taskId`.

- [x] **Step 1: Define the client methods against the Google HTTP API**

`listEvents`, `insertEvent`, `watch`, `stop`. Refresh the access token when it expires within 60 seconds. Send `Authorization: Bearer` only on Calendar calls.

- [x] **Step 2: Implement the four authenticated routes**

Agenda reads `calendar_events` for that user and local day. If `last_synced_at` is older than 2 minutes, refresh from Google first so local dev works when no webhook is configured.

`blocks` loads the caller's task, inserts a Google event whose private extended property is `unmuteTaskId`, then sets `tasks.google_event_id`, `scheduled_start`, and `scheduled_end`.

`notes` creates a note titled with the event title. The body lists the time, each attendee, and the description. It sets `notes.calendar_event_id` and returns the note id.

`DELETE` stops the watch channel when one exists and deletes the account row.

- [x] **Step 3: Add the matching methods on `apiClient`**

### Task 4: Webhook and SSE

**Files:**
- Create: `backend/src/main/java/com/unmute/calendar/web/CalendarWebhookController.java`
- Modify: `backend/src/main/java/com/unmute/live/LiveEventTypes.java`
- Modify: `backend/src/main/java/com/unmute/common/config/SecurityConfig.java`
- Modify: `packages/api-client/src/types.ts`
- Modify: `apps/web/src/hooks/useLiveEvents.ts`
- Test: `backend/src/test/java/com/unmute/calendar/web/CalendarWebhookControllerTest.java`

**Interfaces:**
- Consumes: `CalendarSyncService`, `LiveEventService.publish(UUID userId, String type, Object payload)`
- Produces: `POST /api/v1/webhooks/calendar`. Live event `{ type: 'calendar.updated', data: { userId } }` is not sent to the client; the payload is `{ changed: true }`. The user id is the map key inside `LiveEventService`, not a field other users can subscribe to.

- [x] **Step 1: Write the webhook test with a fake `GoogleCalendarClient`**

Missing or wrong `X-Goog-Channel-Token`: response 200, zero publishes. `X-Goog-Resource-State: sync`: response 200, zero list calls. `exists` plus a matching token: one incremental list using the stored `sync_token`, rows upserted, one `calendar.updated` publish to that user.

- [x] **Step 2: Run the test and confirm it fails**

- [x] **Step 3: Implement the webhook and the watch registration**

`permitAll` this POST only. Compare the header token to `channel_token_hash` with a constant-time check. On `exists`, call `events.list` with `syncToken`. A 410 from Google clears the token and does a full window sync. Then publish after commit.

When `GOOGLE_CALENDAR_WEBHOOK_URL` is set, `watch` is called at the end of a successful connect. A scheduled job renews channels that expire within 24 hours. When the URL is blank, skip `watch` and rely on the 2-minute agenda refresh.

- [x] **Step 4: Teach the frontend stream to invalidate `['calendar']` on `calendar.updated`, including after a reconnect**

- [x] **Step 5: Run the webhook test and confirm it passes**

### Task 5: Calendar page

**Files:**
- Create: `apps/web/src/pages/CalendarPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `apiClient` calendar methods, query key `['calendar', 'agenda', day]`
- Produces: route `/calendar`, nav label `Calendar`

- [x] **Step 1: Add the route and a zinc nav item after Tasks**

- [x] **Step 2: Build the disconnected state**

One sentence, then a `Connect Google Calendar` button that navigates to the `url` from `GET /api/v1/auth/google/start`. Classes: `bg-zinc-100 text-zinc-950`, `min-h-11`, `active:scale-[0.98]`, `transition-all duration-200 ease-out`.

- [x] **Step 3: Build the day view**

Page background `bg-zinc-950`. Hour lines `border-zinc-800`. Event cards `bg-zinc-900 ring-1 ring-inset ring-white/10`. Left rail lists tasks whose `scheduledStart` is null. Day changes with the existing date popover, not a native date input.

Pointer-drag a task chip onto a 30-minute row. On drop, `POST /api/v1/calendar/blocks`. On failure, put the chip back and show the existing error toast path. Do not add a drag library.

- [x] **Step 4: Add the event detail**

A right-hand panel, same pattern as the task drawer: `border-l border-zinc-800 bg-zinc-950`. Show title, time, and attendees in `text-zinc-400` or brighter. Button label `Create Meeting Note` calls the notes endpoint and navigates to `/notes?noteId=`.

### Task 6: Timed extraction proposals

**Files:**
- Modify: `backend/src/main/java/com/unmute/ai/provider/LlmAiProvider.java`
- Modify: `backend/src/main/java/com/unmute/ai/dto/ExtractedTaskItem.java`
- Modify: `backend/src/main/java/com/unmute/ai/provider/MockAiProvider.java`
- Modify: the extract-tasks UI in `apps/web/src/pages/NotesPage.tsx`

**Interfaces:**
- Consumes: today's UTC date already interpolated into `TASKS_SYSTEM`
- Produces: each extracted item has `kind` of `TASK` or `EVENT`, plus nullable `startAt` and `endAt`. `dueDate` stays `YYYY-MM-DD` for tasks.

- [x] **Step 1: Extend `TASKS_SCHEMA` and the prompt rules**

A phrase with a clock time, such as "tomorrow at 3 PM", is `EVENT`. `startAt` is an ISO-8601 instant. `endAt` is one hour later when the note gives no duration. A date without a clock time stays `TASK` with `dueDate` only. Completed checklist items stay excluded.

- [x] **Step 2: Map the new JSON fields in `LlmAiProvider.extractTasks` and the mock provider**

The mock marks an item `EVENT` only when the source line matches a clock time. Extraction still only returns the proposal. It does not insert a task row as a calendar event and it does not call Google.

- [x] **Step 3: In the note extract result, show `Add to calendar` for `EVENT` items**

That button creates the UNMUTE task if it is not saved yet, then calls `POST /api/v1/calendar/blocks`. If the account is not connected, send the user to `/calendar`.

### Task 7: Verify

- [x] Run the new backend tests. On this machine's JDK, do not use Mockito inline spies; use a test subclass or a fake client.
- [x] `npm run typecheck --workspace=apps/web`
- [x] Browser: disconnected `/calendar` shows the zinc connect button. A connected agenda renders events. Dropping a task calls the block endpoint. `Create Meeting Note` opens the new note. Disconnecting the network does not blank the shell.

## Out of scope

Recurring-event editing, multiple calendars, inviting attendees, two-way delete of UNMUTE tasks, and offline calendar mutation. Google remains the source of truth for event times. A Google delete clears `scheduled_start` on the linked task and leaves the task in the rail.

# Daily Briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The home page answers, from stored records only, what to do next, which calendar events are still ahead, and which captures or notes are waiting on the user.

**Architecture:** One authenticated `GET /api/v1/briefing` assembles tasks, stored calendar events, sources, and notes. Ordering and inclusion live in a pure `BriefingRank` so the page cannot invent a row the ranker rejected. The page renders that payload. It does not subscribe to a new event stream.

**Tech Stack:** Spring Boot 3.4.5, the existing task, source, note, and calendar stores, React 19, TanStack Query, Tailwind v4.

**Spec:** This chat's directive, 2026-10-18. There is no separate spec file.

## Global Constraints

- Dark zinc UI. Page background stays the shell's `bg-zinc-950`. Cards use `border-zinc-800`, `bg-zinc-900`, and `ring-1 ring-inset ring-white/10`. Primary text is `text-zinc-100`. Muted text is `text-zinc-400`. No new font, no new motion library, and no new dependency.
- Phone tab bar stays five slots: Home, Notes, record FAB, Tasks, Ask. Do not add a sixth tab. Do not change the FAB's single tap (`/sources?record=1&t=<stamp>`) or its rose recording state. Inbox stays in the phone header and the More sheet.
- Do not add Vitest. Frontend proof is `npm run typecheck --workspace=apps/web` and the browser check in Task 3. Backend proof is the named JUnit test. On this machine run tests with `backend\mvnw.cmd` and quote `-Dtest`.
- Do not call Gemini, Google, or any network from unit tests. The briefing read path may refresh a stale calendar only through the existing puller, and the unit test replaces that puller with a fake.
- JDK 25 cannot mock concrete classes. Tests mock repository interfaces and the interfaces named in this plan. Do not mock `CalendarSyncService`, `CalendarPuller`, or `Task`.
- There is no project entity and no idea entity. "Un-actioned idea" means an unarchived note that has no task row. Do not add a table.
- Do not invent a task, a time, a deadline, or a count. Empty sections use the copy in this plan.
- Do not commit `.env`, `backend/target`, `apps/web/dev-dist`, `.agents`, or `skills-lock.json`.

## Review Focus

- An account with no open tasks still shows a suggested task. Expected: `focus` is null and the section says `No open tasks.`
- Google Calendar is not connected and the home page lists a meeting. Expected: `connected` is false, `deadlines` is empty, and the section says `Google Calendar is not connected.`
- A meeting that already ended, or one that starts on day 8, is shown as approaching. Expected: both are absent from `deadlines`.
- A capture already saved as a note is listed as waiting for review. Expected: `COMPLETED` with a note is excluded; `READY` is included with reason `Ready for review`.
- A low-priority overdue task outranks an urgent task that has no due date. Expected: the urgent task is `focus`.

---

## File structure

- `backend/src/main/java/com/unmute/briefing/BriefingRank.java` — pure ordering and inclusion. No Spring, no stores.
- `backend/src/main/java/com/unmute/briefing/BriefingService.java` — loads the user's rows, calls the ranker, returns the response.
- `backend/src/main/java/com/unmute/briefing/BriefingController.java` — `GET /api/v1/briefing`.
- `backend/src/main/java/com/unmute/briefing/dto/BriefingResponse.java` — response records.
- `backend/src/main/java/com/unmute/calendar/sync/CalendarRefresh.java` — `void refreshIfStale(UUID userId)`.
- `backend/src/main/java/com/unmute/calendar/sync/StaleCalendarRefresh.java` — the production refresh. Same two-minute rule as `CalendarSyncService.agenda`.
- `packages/api-client/src/types.ts` — response types.
- `packages/api-client/src/client.ts` — `getBriefing`.
- `packages/api-client/src/index.ts` — export the new types.
- `apps/web/src/pages/DashboardPage.tsx` — replace the current widgets with the briefing.
- `apps/web/src/pages/CalendarPage.tsx` — honor `?day=YYYY-MM-DD` as the initial day only.

The existing `GET /api/v1/calendar/agenda` stays a single local day. Home does not call it seven times.

## Response

`GET /api/v1/briefing?offsetMinutes={minutes}`

`offsetMinutes` is `new Date().getTimezoneOffset()` (minutes, local behind UTC is positive). Clamp it to `[-840, 840]`, the same clamp as agenda. Missing parameter defaults to `0`.

```text
BriefingResponse
  focus: TaskSlice | null
  nextTasks: TaskSlice[]          // at most 5, excludes focus
  openCount: number               // every open task, not the visible slice
  dueTodayCount: number           // open tasks whose dueDate is inside [dayStart, dayStart + 1 day)
  calendar: { connected: boolean, deadlines: DeadlineSlice[], deadlineCount: number }
  attention: AttentionSlice[]     // at most 6
  readyCount: number              // ready captures before the attention cap
  readingCount: number            // PENDING + TRANSCRIBING + EXTRACTING
```

`TaskSlice`: `id`, `title`, `priority` (`LOW|MEDIUM|HIGH|URGENT`), `dueDate` (nullable instant), `noteId` (nullable), `noteTitle` (nullable).

`DeadlineSlice`: `googleEventId`, `title`, `startsAt`, `endsAt`.

`AttentionSlice`: `kind` (`capture` or `note`), `id`, `title`, `reason`.

Reasons are exactly `Ready for review`, `Failed`, or `No task yet`.

## Ranking rules

Open tasks are `isCompleted == false`. Sort them the way `TaskRepository.findTasksWithFilters` already sorts incomplete tasks: `URGENT`, `HIGH`, `MEDIUM`, `LOW`, then `dueDate` ascending with nulls last, then `createdAt` descending, then `id` ascending as a final tie-break. `focus` is the first row, or null. `nextTasks` is the following five.

A due date is "today" only when `dayStart <= dueDate < dayStart + 1 day`. Earlier is overdue. Later is a later day. Null is not due today and is not overdue.

`dayStart` is the start of the local calendar day of `now` in the zone `ZoneOffset.ofTotalSeconds(-offsetMinutes * 60)`. `windowEnd` is `dayStart` plus 7 days. Both ends are instants.

An event is approaching when its status is not `cancelled`, `endsAt` is after `now`, `startsAt` is before `windowEnd`, and `endsAt` is after `dayStart`. Sort by `startsAt`, then `googleEventId`. `deadlineCount` is that full list. `deadlines` is the first 8. A missing status is kept. A null or blank title stays the stored title; the sync already writes `(No title)`.

Attention, in this order, then cut at 6:

1. Ready captures: status `READY`, or `COMPLETED` with no note. Newest `createdAt` first. Title is `Shared link` when `originalName` is `link.txt`; otherwise the original name; a blank name is `Untitled capture`. Reason `Ready for review`.
2. Failed captures: status `FAILED`, newest first. Same title rule. Reason `Failed`.
3. Notes: not archived, and the note id is not on any task (completed tasks count as actioned). Newest `updatedAt` first. Blank title is `Untitled`. Reason `No task yet`.

`readyCount` counts group 1 before the cap. `readingCount` is not part of `attention`. Saved captures (`COMPLETED` with a note) and in-flight captures are not attention rows.

When Google Calendar has no account, do not refresh and do not read events. `connected` is false and both deadline fields are empty. When an account exists, call `refreshIfStale` once, then read stored events in `[dayStart, windowEnd)`. A pull failure is logged by class name and the stored rows are still returned.

---

### Task 1: Rank tasks, deadlines, and attention

**Files:**
- Create: `backend/src/main/java/com/unmute/briefing/BriefingRank.java`
- Test: `backend/src/test/java/com/unmute/briefing/BriefingRankTest.java`

**Interfaces:**
- Consumes: nothing
- Produces: `BriefingRank.rankOpenTasks(List<TaskRow>)`, `BriefingRank.dueToday(List<TaskRow> openRanked, Instant dayStart)`, `BriefingRank.approaching(List<Deadline> events, Instant now, Instant dayStart, Instant windowEnd)`, `BriefingRank.attention(List<Capture> sources, List<NoteRow> notes, Set<UUID> noteIdsWithAnyTask)`. Nested records `TaskRow`, `Deadline`, `Capture`, `NoteRow`, `Attention` with the fields named in the ranking rules. `rankOpenTasks` returns every open task in order. `approaching` returns every matching event in order. `attention` returns every matching row in order. Caps stay in the service so these methods stay total.

- [x] **Step 1: Write the failing test**

Cover these cases in `BriefingRankTest`:

- `urgentWithoutDateOutranksOverdueLow` — a `LOW` task due yesterday and an `URGENT` task with a null due date. The urgent id is first.
- `samePriorityUsesDueDateThenNewestCreated` — two `HIGH` tasks; the earlier due date is first. Two `MEDIUM` tasks with the same due date; the later `createdAt` is first. A completed task is absent.
- `noOpenTasks` — a completed-only list returns an empty list.
- `dueTodayIgnoresNullAndOtherDays` — only the task inside `[dayStart, dayStart + 1 day)` counts.
- `endedAndEighthDayAreExcluded` — an event with `endsAt` equal to `now` is out; an event with `startsAt` equal to `windowEnd` is out; a `cancelled` event inside the window is out; an event that started before `dayStart` and ends after `now` is in; result order is `startsAt`.
- `savedCaptureIsNotWaiting` — `COMPLETED` with `hasNote` true is absent; `READY` is present with reason `Ready for review` and title `Shared link` when the name is `link.txt`; `FAILED` follows ready rows; a note whose id is in the task set is absent; an archived note is absent; a remaining note has reason `No task yet` and title `Untitled` when its title is blank.

- [x] **Step 2: Run the test to verify it fails**

Run: `backend\mvnw.cmd -Dtest=BriefingRankTest test`

Expected: compile failure because `BriefingRank` does not exist.

- [x] **Step 3: Implement `BriefingRank`**

Put the class in `com.unmute.briefing`. Private constructor. No Spring annotations. Implement the four methods to satisfy the tests and the ranking rules above.

- [x] **Step 4: Run the test to verify it passes**

Run: `backend\mvnw.cmd -Dtest=BriefingRankTest test`

Expected: exit 0.

- [x] **Step 5: Commit**

```powershell
git add -- backend/src/main/java/com/unmute/briefing/BriefingRank.java backend/src/test/java/com/unmute/briefing/BriefingRankTest.java
git commit -m @"
feat(briefing): rank the next task, the week, and what is waiting

Home needs one ordering for real tasks, stored events, and unsaved captures.
"@
```

---

### Task 2: Serve the briefing

**Files:**
- Create: `backend/src/main/java/com/unmute/briefing/dto/BriefingResponse.java`
- Create: `backend/src/main/java/com/unmute/briefing/BriefingService.java`
- Create: `backend/src/main/java/com/unmute/briefing/BriefingController.java`
- Create: `backend/src/main/java/com/unmute/calendar/sync/CalendarRefresh.java`
- Create: `backend/src/main/java/com/unmute/calendar/sync/StaleCalendarRefresh.java`
- Modify: `packages/api-client/src/types.ts`
- Modify: `packages/api-client/src/client.ts`
- Modify: `packages/api-client/src/index.ts`
- Test: `backend/src/test/java/com/unmute/briefing/BriefingServiceTest.java`

**Interfaces:**
- Consumes: `BriefingRank` from Task 1. `TaskRepository.findTasksWithFilters(userId, false, null, null)`. `SourceRepository.findByUserIdOrderByCreatedAtDesc`. `NoteRepository.findByUserIdAndIsArchived(userId, false, PageRequest.of(0, 100, Sort.by(DESC, "updatedAt")))`. `CalendarAccountStore.findByUserId`. `CalendarEventStore.between(userId, dayStart, windowEnd)`.
- Produces: `BriefingService.briefing(UUID userId, int offsetMinutes, Instant now)` returns `BriefingResponse`. `GET /api/v1/briefing`. `apiClient.getBriefing(offsetMinutes: number): Promise<BriefingResponse>`. `CalendarRefresh.refreshIfStale(UUID userId)`.

Response records, in `BriefingResponse.java`:

```java
public record BriefingResponse(
        TaskSlice focus,
        List<TaskSlice> nextTasks,
        int openCount,
        int dueTodayCount,
        CalendarSlice calendar,
        List<AttentionSlice> attention,
        int readyCount,
        int readingCount
) {
    public record TaskSlice(UUID id, String title, TaskPriority priority, Instant dueDate, UUID noteId, String noteTitle) {}
    public record CalendarSlice(boolean connected, List<DeadlineSlice> deadlines, int deadlineCount) {}
    public record DeadlineSlice(String googleEventId, String title, Instant startsAt, Instant endsAt) {}
    public record AttentionSlice(String kind, UUID id, String title, String reason) {}
}
```

- [x] **Step 1: Write the failing service test**

`BriefingServiceTest` constructs `BriefingService` with Mockito mocks of `TaskRepository`, `SourceRepository`, `NoteRepository`, `CalendarAccountStore`, `CalendarEventStore`, and `CalendarRefresh`.

- `disconnectedDoesNotInventEvents` — account lookup is empty. One open task is returned by the task repository. Assert `focus` is that task, `calendar.connected()` is false, `deadlines` is empty, `deadlineCount` is 0, and `refreshIfStale` and `between` are never called.
- `connectedReadsTheStoredWeek` — account lookup is present. `between` returns one event inside the window. Assert `refreshIfStale` is called once with the user id, `connected()` is true, and that event is the only deadline.
- `sevenReadyCapturesReportTheFullCount` — seven `READY` sources and one noteless note. Assert `readyCount` is 7, `attention` has size 6, all six kinds are `capture`, and the note is not in the list.
- `emptyUser` — every store returns an empty list and no account. Assert `focus` is null, `openCount` is 0, `dueTodayCount` is 0, `attention` is empty, `readyCount` is 0, and `readingCount` is 0.

Map entities with their real constructors and setters. Do not mock `Task`, `Note`, or `Source`.

- [x] **Step 2: Run the test to verify it fails**

Run: `backend\mvnw.cmd -Dtest=BriefingServiceTest test`

Expected: compile failure because `BriefingService` does not exist.

- [x] **Step 3: Implement the service, the refresh adapter, and the controller**

`BriefingService.briefing` loads the rows, maps them to ranker records, and applies the caps: `nextTasks` is `skip(1).limit(5)`, `deadlines` is `limit(8)`, `attention` is `limit(6)`. Counts use the lists before those caps. `readingCount` is the number of loaded sources whose status is `PENDING`, `TRANSCRIBING`, or `EXTRACTING`.

`StaleCalendarRefresh` copies the agenda guard: if `lastSyncedAt` is null or older than two minutes, call `CalendarPuller.pull`. On `RuntimeException`, log the exception class name and return. Do not change `CalendarSyncService.agenda`.

`BriefingController` requires a principal the same way `CalendarController` does, passes `Instant.now()`, and returns the response. Register it on `/api/v1/briefing`.

Add the TypeScript types and `getBriefing` to the api-client, and export `BriefingResponse` from `index.ts`. The client method is a `GET` to `/api/v1/briefing?offsetMinutes=`.

- [x] **Step 4: Run the test to verify it passes**

Run: `backend\mvnw.cmd -Dtest=BriefingServiceTest test`

Expected: exit 0.

- [x] **Step 5: Commit**

```powershell
git add -- backend/src/main/java/com/unmute/briefing backend/src/main/java/com/unmute/calendar/sync/CalendarRefresh.java backend/src/main/java/com/unmute/calendar/sync/StaleCalendarRefresh.java backend/src/test/java/com/unmute/briefing/BriefingServiceTest.java packages/api-client/src/types.ts packages/api-client/src/client.ts packages/api-client/src/index.ts
git commit -m @"
feat(briefing): serve today's tasks, calendar, and waiting items

The home screen can read one payload instead of guessing urgency from partial lists.
"@
```

---

### Task 3: Render the briefing on Home

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/pages/CalendarPage.tsx` (initial day from `day` only)

**Interfaces:**
- Consumes: `apiClient.getBriefing` and `BriefingResponse` from Task 2. Existing `TaskDetailDrawer` and `apiClient.getTasks`.
- Produces: the signed-in `/` page described below.

- [x] **Step 1: Replace the home body**

Remove the recent-notes widget, the upcoming-tasks widget, the AI-workflows widget, and the four stat chips. Keep `TaskDetailDrawer`.

Query key `['briefing', offsetMinutes]` with `offsetMinutes = new Date().getTimezoneOffset()`. `refetchInterval` is `1500` while `readingCount > 0`, otherwise `8000`. Also load `['tasks', 'home']` via `getTasks({})` so a click can open the existing drawer with a full `Task`. If that list has no matching id, the row stays visible and the click does nothing.

Layout, mobile first. Below `md`, one column. At `md` and up, two columns: the task sections on the left, calendar and attention on the right. Outer wrapper stays `w-full max-w-[90rem] mx-auto px-1 sm:px-2 py-2`.

The in-page heading is the local date from `toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })`. The second line is the display name already used on this page. Do not write a greeting and do not change the shell title `Home`.

Under the heading, three links in a `grid grid-cols-3 gap-3`:

| Label | Value | href |
| --- | --- | --- |
| Open tasks | `openCount` | `/tasks` |
| Due today | `dueTodayCount` | `/tasks` |
| Ready | `readyCount` | `/inbox` |

While the briefing query is loading, each value is `—` and the sections show one line, `Loading`. On error, one line, `The briefing could not be loaded.` and a button `Retry` that refetches. Do not show zeros during loading or after an error.

Sections, in this order, each a card with the classes in Global Constraints:

1. `Do this next`. If `focus` is null: `No open tasks.` Otherwise one button, at least `min-h-11`, with the task title and a due label. Click opens the drawer.
2. `Also open`, only when `nextTasks` is not empty. Each row is a `min-h-11` button. A `View all` link goes to `/tasks`.
3. `Coming up`. If `connected` is false: `Google Calendar is not connected.` and a link `Connect Google Calendar` to `/calendar`. If connected and `deadlines` is empty: `Nothing on the calendar in the next 7 days.` Otherwise each row links to `/calendar?day=YYYY-MM-DD` for that event's local start date, shows the stored title, and shows a time label. A `View calendar` link goes to `/calendar`.
4. `Needs a look`. If `attention` is empty and `readingCount` is 0: `Nothing is waiting.` If `readingCount` is 1, also show `1 capture is still being read.` If it is greater than 1, show `{readingCount} captures are still being read.` A `capture` row links to `/inbox/{id}` when the reason is `Ready for review`, and to `/sources` when the reason is `Failed`. A `note` row links to `/notes?noteId={id}`. Show the `reason` string as the row's secondary text.

Due labels, from the instant and the local calendar day: `Overdue` in `text-red-400` when the due instant is before today's start; `Today` in `text-amber-300` when it is today; `No date` in `text-zinc-400` when it is null; otherwise the short month and day in `text-zinc-400`. Do not write `Due soon`, `Urgent`, or `Critical`.

Event time labels: `Now` when `startsAt <= now < endsAt`; `Today` plus the local time when it starts today and has not started; otherwise weekday, short month, day, and local time. An event that already ended is not in the payload, so do not add a past label.

In `CalendarPage`, when the `day` search param matches `^\d{4}-\d{2}-\d{2}$`, use that local date as the initial `day` state. Ignore any other value. Later prev/next clicks keep working.

- [x] **Step 2: Typecheck**

Run: `npm run typecheck --workspace=apps/web`

Expected: exit 0.

- [x] **Step 3: Check it in the browser**

The dev server is already at `http://localhost:3000`. Sign in with the demo account button, then Sign In. At about 390px width and again at about 1280px width:

- `/` shows the date, `Do this next`, `Coming up`, and `Needs a look`.
- The focus title is the `focus.title` from `GET /api/v1/briefing`, or `No open tasks.` when `focus` is null.
- If `calendar.connected` is false, the page contains `Google Calendar is not connected.` and no deadline title.
- If `attention` is empty, the page contains `Nothing is waiting.`
- The bottom bar is still Home, Notes, record, Tasks, and Ask.
- Clicking the focus task opens the task drawer when that task is in `getTasks`.
- A deadline link, when any exist, lands on `/calendar?day=` plus that event's date.
- Clear any device-metrics override before finishing.

- [x] **Step 4: Commit**

```powershell
git add -- apps/web/src/pages/DashboardPage.tsx apps/web/src/pages/CalendarPage.tsx
git commit -m @"
feat(web): turn home into a briefing of real tasks and deadlines

Opening UNMUTE should show what is actually due, scheduled, and waiting.
"@
```

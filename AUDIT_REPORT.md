# Phase 7.5 — System Audit

Date: 2026-10-16. Scope: layout expansion, core-loop QA in the browser (demo account), and a pruning / UX recommendation. No new product features.

## Bugs found and fixed

### 1. Task rows opened the notes list, not the note

`TasksPage` rendered a parent-note chip whose click handler was `navigate('/notes')`. The note id was dropped, so "open this task's note" landed on whatever note the list selected first.

Fix: navigate to `/notes?noteId=…`. Verified in the browser: the chip for "note 1" opened that note, with its tags and body.

### 2. New transcripts were stamped with junk tags

`TranscriptionJobHandler` saved every voice note with the tags `voice-note` and `transcription` before auto-tag ran. Those labels are on the auto-tagger's generic-tag blocklist, so they fought the real tags and showed up on cards (visible on existing notes such as the 6:08 recording).

Fix: the transcript note is saved without those seed tags. Auto-tag (`AUTO_TAG_NOTE`, immediate, off the request thread) is now the only writer of tags for a new recording. Notes already saved keep whatever tags they have.

### 3. Arabic and mixed-direction text was pinned to the left

Task titles, note titles, excerpts, and the three search fields used physical `left` / `pl` / `text-left` alignment. An Arabic title or transcript (confirmed in Sources: a Darija voice note, and tag chips `#تمارين`, `#روتين-يومي`, `#يوميات`) could not set its own direction.

Fix:

- `dir="auto"` and `text-start` on task titles, descriptions, linked-note labels, note-card titles, and excerpts.
- Search icons and padding use logical properties (`start` / `end`, `ps` / `pe`) on Notes, Tasks, and Sources.
- The note title field is `dir="auto"`.
- The editor's text-direction extension defaults to `auto`, so a paragraph follows the first strong character instead of staying LTR.

### Observed, not changed

- Three sources are `FAILED`. They date from the earlier mock / `gemini-2.5-flash` window. Retry is already on the row. Not a current wiring bug: the latest recording (`09:01`) transcribed real speech ("hello everyone… play some games… trip with friends").
- Older notes still contain the canned Q1-roadmap mock transcript. That text is stored data from before Gemini transcription was actually running. New recordings do not get it.
- Ask UNMUTE renders (composer, suggestions, RAG / vector-search toggle). A live question was not sent in this pass, so grounding quality was not re-scored.
- The graph loads: 19 notes, 9 tasks, 11 sources, 21 tags.
- The live indicator reaches `Live` after the first SSE `ready` event. The first paint can say `Connecting` for a moment; that is the handshake, not a stuck socket.

## UI / UX changes

Data pages no longer sit in a narrow centered column.

| Surface | Before | After |
|---|---|---|
| Tasks header and list | `max-w-4xl` | Full content width, `px-4 sm:px-8 xl:px-12`. Descriptions use the leftover row instead of a 280px cap. |
| Sources | `max-w-6xl` | Full content width, same padding scale. |
| Dashboard (and any non-full-bleed page) | App shell `max-w-7xl` | Shell padding only; the page uses the pane. |
| Notes editor | `max-w-3xl` | `max-w-5xl`, `xl:max-w-6xl`. Still centered so a line stays readable; the list + editor already span the pane. |
| Ask UNMUTE | `max-w-4xl` | Left as-is. A chat column should not stretch to the edges of a wide monitor. |

Tag chips in the notes list sit on an opaque `bg-zinc-950` bar (`z-10`, `shrink-0`) so they stay readable above the scrolling cards.

Browser check: Tasks list spans the pane beside the sidebar; Notes opens the note a task points at; Sources shows the recorder, drop zone, and transcript list including Arabic; Graph and Ask both mount.

## Pruning recommendations

Do not delete data. Hide or merge empty navigation.

1. **Remove Projects from the nav.** `/projects` is a placeholder ("Phase 3"). It is not a product surface. Tasks already carry priority, due date, and a link back to a note. A project object is only worth a nav item once it has a milestone model. Until then it is a dead end.

2. **Remove Settings from the nav.** `/settings` is the same kind of placeholder. Session and logout already live in the sidebar footer. A settings page should appear when there is something to set (model, language, auto-tag on/off).

3. **Keep Sources, do not fold it into Notes.** Capture (record, upload, retry, failure) is a different job from reading a note. The link "view note" already jumps into Notes. Merging them would bury failed transcriptions inside the note list. What should go away is the duplicate story: the dashboard is still a Phase 1 auth inspector (token latency, `/users/me` probe). Replace that page with a real home — counts, recent notes, failed sources — or drop Dashboard and land on Notes.

4. **Drop the phase badges** ("Phase 2" … "Phase 6") from nav items. They are build notes, not user information.

5. **Stop showing `voice-note` / `transcription` on old cards** with a one-time cleanup, optional. New notes no longer get them; existing rows still do.

## Ultimate UX features (next three)

1. **Command palette (`Ctrl+K` / `Cmd+K`).** One input that jumps to a note, task, tag, or source, and runs "new note", "new task", "ask". The app already has `C` for a new task, but only while Tasks is mounted, and nothing global. This is the single highest-leverage Linear-style gap.

2. **A real home, not the auth inspector.** Open the app onto what changed: notes tagged in the last day, tasks due today, sources that failed. The data is already in the queries the other pages use.

3. **Keyboard on the note list.** `J` / `K` or arrow keys to move the selection, `Enter` to focus the title, `Esc` back to the list. Combined with the palette, the capture loop (record → transcript → tags → extract task → open the note) stops depending on the pointer.

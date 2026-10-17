# Mobile Record FAB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Put a protruding record button in the center of the phone tab bar so voice capture is the hero action below `md`.

**Architecture:** `MobileTabBar` becomes five slots: Home, Notes, record, Tasks, Ask. The center control is a button, not a route. Idle taps navigate to `/sources?record=1&t=<stamp>`, the same contract `CommandPalette` already uses to start the microphone. `SourcesPage` keeps owning `MediaRecorder`. It publishes `unmute:recording` and listens for `unmute:stop-recording`, so the button can turn rose and stop a live take without a second recorder.

**Tech Stack:** React 19, Tailwind v4, existing `SourcesPage` recorder, Lucide `Mic` and `Square`.

**Spec:** This chat's directive, 2026-10-18. There is no separate spec file.

## Global Constraints

- Phone only. The bar stays `md:hidden`. At `md` and up, do not render this button and do not change the sidebar.
- Slot order: Home (`/`), Notes (`/notes`), record, Tasks (`/tasks`), Ask (`/ask`).
- The record control is a circle, `h-14 w-14 rounded-full`, absolutely placed in its slot with `-top-5` so it breaks the top edge of the `h-14` row.
- Idle classes: `border border-violet-400/40 bg-zinc-950 text-zinc-100 shadow-[0_0_15px_rgba(167,139,250,0.45)]`.
- Recording classes, taken from the Sources mic: `bg-rose-600 text-white shadow-rose-600/40`. Icon swaps from `Mic` to `Square` with `fill-current`.
- Press: `transition-all duration-200 ease-out active:scale-[0.98]`. Focus: `focus:outline-none focus:ring-1 focus:ring-zinc-700`.
- Safe area stays `pb-[env(safe-area-inset-bottom)]` on the `nav`, below the `h-14` row. Do not move that padding onto the button.
- Do not add `overflow-hidden` on the `nav`. A fixed bar inside an overflow-hidden shell still paints the circle; clipping the nav would cut it off.
- Do not add a recording context, a gesture library, or Vitest. Proof is `npm run typecheck --workspace=apps/web` plus the browser checks below.
- Do not commit `.env`.

## Review Focus

- A second tap while the microphone is open starts another `getUserMedia` call. Expected: it stops the current take.
- Leaving `/sources` mid-recording leaves the button rose. Expected: unmount already stops the hardware, and the button returns to the violet idle state.
- The home-indicator inset pushes the circle down into the bar or clips it. Expected: the circle still protrudes about 20px above the row, and the inset remains padding under the row.
- At 768px and wider the fifth slot or the circle appears. Expected: no tab bar at all.
- Ask disappears from the bar. Expected: Ask is the last slot and still opens `/ask`.

---

### Task 1: Publish the live recording signal

**Files:**
- Modify: `apps/web/src/pages/SourcesPage.tsx` (the `record=1` effect near the recorder handlers, and the unmount cleanup)

**Interfaces:**
- Consumes: existing `startRecording()`, `stopRecording()`, `isRecording`, and the `record` / `t` search params.
- Produces:
  - `window` event `unmute:recording`, a `CustomEvent` whose `detail` is `{ active: boolean }`.
  - `window` event `unmute:stop-recording`, a plain `Event`. `SourcesPage` is the only listener.

- [x] **Step 1: Guard a second start and publish `active`**

In the existing `record=1` effect, return before `startRecording()` when `isRecording` is already true. Keep the sessionStorage token check so one `t` value cannot start twice.

Add an effect that dispatches `unmute:recording` with `{ active: isRecording }` whenever `isRecording` changes.

- [x] **Step 2: Stop from the tab bar without a stale closure**

Keep a ref, `stopRef`, assigned to `stopRecording` on every render. One mount effect listens for `unmute:stop-recording` and calls `stopRef.current()`. Its cleanup removes the listener and dispatches `unmute:recording` with `{ active: false }`, so leaving the page cannot leave the button rose. The unmount path that already stops the `MediaRecorder` stays as it is.

- [x] **Step 3: Typecheck**

Run: `npm run typecheck --workspace=apps/web`
Expected: exit 0.

### Task 2: Center the record button

**Files:**
- Modify: `apps/web/src/components/MobileTabBar.tsx`

**Interfaces:**
- Consumes: `unmute:recording` and `unmute:stop-recording` from Task 1. Navigation target `/sources?record=1&t=<stamp>` where `stamp` is `Date.now().toString(36)`, matching `CommandPalette`.
- Produces: `MobileTabBar` still takes no props.

- [x] **Step 1: Split the row into five slots**

Replace `grid-cols-4` with `grid-cols-5`. Render Home and Notes, then the record button, then Tasks and Ask. Home keeps `end`. Ask moves from the third slot to the fifth. Do not add a label under the circle.

- [x] **Step 2: Draw the protruding circle**

The center slot is `relative flex items-center justify-center`. The button is `type="button"`, `absolute left-1/2 -translate-x-1/2 -top-5`, `h-14 w-14 rounded-full`, with the idle classes, press classes, and focus ring from Global Constraints. Idle icon is `Mic` at `h-6 w-6`. `aria-label` is `Start recording`.

Listen for `unmute:recording` and store `active` in state. When `active` is true, replace the idle color classes with the rose classes, show `Square` at `h-5 w-5 fill-current`, and set `aria-label` to `Stop recording`.

- [x] **Step 3: Wire the click**

If `active` is true, dispatch `unmute:stop-recording` and return. Otherwise `navigate` to `/sources?record=1&t=` plus `Date.now().toString(36)`.

- [x] **Step 4: Typecheck**

Run: `npm run typecheck --workspace=apps/web`
Expected: exit 0.

- [x] **Step 5: Browser check**

At 390×844, signed in: the bar reads Home, Notes, a circle, Tasks, Ask. The circle's top is above the bar's top border, its fill is zinc-950, and it has the violet border and glow. Tapping it lands on `/sources` and the page mic plus the circle both show the rose recording state. Tapping the circle again stops that take and the circle returns to violet. Ask still opens `/ask`. The bar's bottom padding is still the safe-area inset.

At 1280×800: no tab bar and no circle. The sidebar still lists Home through Graph.

Clear `Emulation.clearDeviceMetricsOverride` before finishing.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/components/MobileTabBar.tsx apps/web/src/pages/SourcesPage.tsx docs/superpowers/plans/2026-10-18-mobile-record-fab.md
git commit -m "feat(web): center a record button in the phone tab bar"
```

Do not push unless asked.

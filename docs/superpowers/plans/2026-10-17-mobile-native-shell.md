# Native Mobile Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the installed PWA feel like a native phone app below the `md` breakpoint, while the `md` and larger zinc workspace stays the current left sidebar.

**Architecture:** Tailwind's default `md` breakpoint (768px) is the only switch. Below it, `AppShell` hides the sidebar with `hidden md:flex` (it stays mounted), shows a fixed frosted bottom tab bar, and pads the main column so content clears that bar and the home-indicator inset. Centered dialogs share one position class that is a bottom sheet below `md` and the existing centered panel at `md`. No new navigation library, dialog library, or gesture library.

**Tech Stack:** React 19, Tailwind v4, the existing Radix dialogs, `react-force-graph-2d` (d3-zoom already handles pinch).

**Spec:** Mobile directive dated 2026-10-17. Desktop remains the zinc-950 workspace. Bottom bar icons are Home, Notes, Ask, and Tasks. Safe-area padding is `pb-[env(safe-area-inset-bottom)]`. Sheets use `rounded-t-2xl` and a zinc pill. Touch targets are at least 44×44px on mobile. Press feedback stays `active:scale-[0.98]`.

## Global Constraints

- `md` (768px) and up keeps the current left sidebar, desktop header, command palette, and Ask companion. Do not restyle those desktop classes.
- Below `md`, the sidebar is not a drawer and the hamburger is gone.
- Bottom tabs, in order: Home (`/`), Notes (`/notes`), Ask (`/ask`), Tasks (`/tasks`). Labels are those four words. Icons already used in `AppShell`: `LayoutDashboard`, `FileText`, `Sparkles`, `CheckSquare`.
- Calendar, Sources, and Graph stay reachable from a More control. Do not remove their routes.
- Bottom bar classes: `bg-zinc-950/80 backdrop-blur-md border-t border-zinc-800` plus `pb-[env(safe-area-inset-bottom)]`.
- `active:scale-[0.98]` and `transition-all duration-200 ease-out` on tab links and the new mobile controls. `prefers-reduced-motion` in `index.css` already zeros transforms; do not add a motion library.
- Focus ring stays `focus:outline-none focus:ring-1 focus:ring-zinc-700`.
- No violet laser on the shell, the tab bar, or the More sheet. Ask send buttons keep their existing laser.
- Do not change React Query keys, AI calls, or API clients.
- There is no frontend unit-test runner. Do not add Vitest. Proof is `npm run typecheck --workspace=apps/web` plus the browser checks in Task 7.
- Do not commit `.env`.

## Review Focus

- A phone with a home indicator hides the last task row and the note editor actions under the tab bar. Expected: the main column clears `3.5rem + env(safe-area-inset-bottom)`.
- At 768px and wider the left sidebar is missing or the old hamburger drawer is back. Expected: the current sidebar and desktop header, and no bottom bar.
- Create Task on a desktop window opens as a bottom sheet. Expected: the current centered `max-w-xl` panel.
- Pinching the graph zooms the browser page. Expected: the canvas zooms and the page does not.
- Dropping a task from the mobile calendar sheet has no visible timeline. Expected: the sheet covers at most 40dvh and the day grid stays above it.

---

### Task 1: Safe area and bottom tab bar

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/components/AppShell.tsx`
- Create: `apps/web/src/components/MobileTabBar.tsx`

**Interfaces:**
- Consumes: `nav` routes already in `AppShell` (`/`, `/notes`, `/ask`, `/tasks`, `/calendar`, `/sources`, `/graph`), `getPageTitle()`, `OPEN_PALETTE_EVENT`, `InstallAppButton`, `handleLogout`
- Produces: `MobileTabBar` with no props. `AppShell` owns More-sheet state `moreOpen: boolean`.

- [x] **Step 1: Set the viewport so `env(safe-area-inset-*)` is non-zero in standalone display**

In `apps/web/index.html`, replace the viewport meta with `width=device-width, initial-scale=1, viewport-fit=cover`. Leave `theme-color` `#09090b` and the Apple status-bar meta as they are.

- [x] **Step 2: Hide the sidebar below `md` without unmounting it**

In `AppShell`, delete `mobileMenuOpen` and the backdrop. The aside class becomes `hidden md:flex` plus the existing desktop sticky classes (`md:static md:h-dvh md:sticky md:top-0 w-60 ...`). Remove the translate-x drawer classes. Remove the mobile hamburger header.

- [x] **Step 3: Add the mobile top bar and `MobileTabBar`**

Below `md` only (`md:hidden`), render a top bar with `pt-[env(safe-area-inset-top)]`, `px-4`, `border-b border-zinc-800`, `bg-zinc-950`. It shows `pageTitle` (`text-sm tracking-tight`), a search icon button that dispatches `OPEN_PALETTE_EVENT`, and a More button. Each icon button is `min-h-11 min-w-11`.

`MobileTabBar` is `fixed inset-x-0 bottom-0 z-40 md:hidden`, with the frosted classes from the spec and a `h-14` row. Four `NavLink`s. Active link: `text-zinc-100`. Inactive: `text-zinc-500`. `end` only on Home. `aria-current` comes from `NavLink`.

The main column gets `pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0`. Full-bleed routes keep `min-h-0 overflow-hidden`; the padding is on that column so Notes, Tasks, Ask, Graph, and Calendar end above the bar.

- [x] **Step 4: More sheet for the routes that are not tabs**

`moreOpen` opens a bottom sheet (Task 2's position class can be inlined here if Task 2 is not done yet: `fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] rounded-t-2xl border-t border-zinc-800 bg-zinc-950 pb-[env(safe-area-inset-bottom)] md:hidden`). Contents, in order: Calendar, Sources, Graph, then `InstallAppButton`, then Sign out. Choosing a route sets `moreOpen` to false. A zinc pill sits at the top: `mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-600`. Tapping the overlay closes it. The pill is not a drag gesture.

Render `InstallAppButton` here as a second instance. The sidebar instance stays mounted because the aside is `hidden`, not unmounted, so `beforeinstallprompt` still has a listener if More was never opened. Both instances may listen. Do not conditionally mount the sidebar.

- [x] **Step 5: Hide the Ask companion below `md`**

On `AskCompanion`'s root, add `max-md:hidden` so the floating button does not sit on the tab bar. `/ask` remains the mobile Ask surface. Desktop companion is unchanged.

- [x] **Step 6: Typecheck**

Run: `npm run typecheck --workspace=apps/web`
Expected: exit 0.

### Task 2: Centered dialogs become bottom sheets below `md`

**Files:**
- Create: `apps/web/src/components/ui/responsiveDialog.ts`
- Modify: `apps/web/src/components/tasks/QuickAddDialog.tsx`
- Modify: `apps/web/src/components/tasks/TaskDetailDrawer.tsx`
- Modify: `apps/web/src/pages/TasksPage.tsx` (delete confirm, around the `deleteConfirmId` block)
- Modify: `apps/web/src/pages/NotesPage.tsx` (the two centered confirm overlays)
- Modify: `apps/web/src/pages/SourcesPage.tsx` (the right-edge detail overlay)

**Interfaces:**
- Consumes: nothing from Task 1
- Produces: exported string `responsiveDialogContentClass` and exported string `sheetHandleClass`

`responsiveDialogContentClass` is the position contract:

- Below `md`: `fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border-t border-zinc-800 bg-zinc-950 pb-[env(safe-area-inset-bottom)]`
- At `md`: keep each caller's current desktop placement. Quick Add stays `md:left-1/2 md:top-[28%] md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-xl md:rounded-xl md:border md:border-zinc-800/80`. Task detail and the Sources panel stay a right drawer at `md` (`md:inset-y-0 md:right-0 md:bottom-auto md:max-w-md md:rounded-none md:border-l`). Delete confirms stay centered at `md` (`md:left-1/2 md:top-1/2 md:max-w-sm md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl`).

`sheetHandleClass` is `mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-600 md:hidden`.

- [x] **Step 1: Add the two class strings in `responsiveDialog.ts`**

No React component. Callers render their own overlay and put a `div` with `sheetHandleClass` as the first child of the panel, `aria-hidden`.

- [x] **Step 2: Apply the classes to Quick Add, both delete confirms, the task drawer, and the Sources detail**

Do not change submit handlers, focus-on-open, or copy. Command palette stays top-aligned (`pt-[12vh]`). Date popovers stay anchored. Do not add a dismiss-drag library.

- [x] **Step 3: Typecheck**

Run: `npm run typecheck --workspace=apps/web`
Expected: exit 0.

### Task 3: 44px touch targets on mobile only

**Files:**
- Modify: `apps/web/src/index.css` (task-list label rule)
- Modify: icon-only buttons in `apps/web/src/pages/TasksPage.tsx`, `NotesPage.tsx`, `SourcesPage.tsx`, `CalendarPage.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: a CSS media rule and `max-md:min-h-11 max-md:min-w-11` on icon-only buttons

- [x] **Step 1: Enlarge the task-list hit target without enlarging the check mark**

In `index.css`, under `@media (max-width: 767px)`, set `.tiptap ul[data-type="taskList"] li > label` to `min-width: 44px` and `min-height: 44px`. Leave the checkbox input at `1.15rem` at every width. Do not change the checked color.

- [x] **Step 2: Pad icon-only buttons below `md`**

Any button whose visible content is only an icon (previous/next day, mark complete, delete, note back, source close) gets `max-md:min-h-11 max-md:min-w-11` plus the existing press classes if they are missing. Do not add those minimums at `md` and up. Text buttons that are already `min-h-11` stay as they are.

- [x] **Step 3: Typecheck**

Run: `npm run typecheck --workspace=apps/web`
Expected: exit 0.

### Task 4: Mobile padding and card radius

**Files:**
- Modify: `apps/web/src/pages/TasksPage.tsx`
- Modify: `apps/web/src/pages/SourcesPage.tsx`
- Modify: `apps/web/src/pages/AskUnmutePage.tsx`
- Modify: `apps/web/src/pages/NotesPage.tsx` (editor header padding only)
- Modify: `apps/web/src/pages/DashboardPage.tsx` if a card uses `rounded-2xl` or `px-8`

**Interfaces:**
- Consumes: nothing
- Produces: horizontal padding `px-4` below `md`, and the previous `px-8` / `xl:px-12` from `md` up

- [x] **Step 1: Move the wide padding to the sidebar breakpoint**

Replace page shells `px-4 sm:px-8 xl:px-12` with `px-4 md:px-8 xl:px-12`. Ask headers `px-6` become `px-4 md:px-6`. Notes editor header `px-3 sm:px-8` becomes `px-4 md:px-8`.

- [x] **Step 2: Tighten card radius and gaps below `md`**

Empty states and stat cards that use `rounded-2xl` get `max-md:rounded-lg`. Source and dashboard grids that use `gap-4` get `gap-2 md:gap-4`. Do not change colors, rings, or copy.

- [x] **Step 3: Typecheck**

Run: `npm run typecheck --workspace=apps/web`
Expected: exit 0.

### Task 5: Calendar rail becomes a half-height sheet

**Files:**
- Modify: `apps/web/src/pages/CalendarPage.tsx`

**Interfaces:**
- Consumes: existing `unscheduled`, `onChipPointerDown` / `Move` / `Up`, `selected` event
- Produces: `tasksOpen: boolean` local state. No new props.

- [x] **Step 1: Hide the unscheduled aside and the event side panel below `md`**

The unscheduled `<aside>` gets `hidden md:flex`. The event detail `<aside>` gets `hidden md:flex`. Desktop layout is otherwise unchanged, including pointer-drag onto 30-minute rows.

- [x] **Step 2: Add the Tasks control and a 40dvh sheet**

Below `md`, a button labeled `Tasks` sits `fixed right-4 z-30 min-h-11` with `bottom-[calc(4.5rem+env(safe-area-inset-bottom))]`, classes `bg-zinc-100 text-zinc-950 active:scale-[0.98]`. It toggles `tasksOpen`.

The sheet is `fixed inset-x-0 z-50 max-h-[40dvh] overflow-y-auto rounded-t-2xl border-t border-zinc-800 bg-zinc-950 md:hidden`, with `bottom-[calc(3.5rem+env(safe-area-inset-bottom))]` so it sits on the tab bar, not under it. Same task chips and the same pointer handlers. The day grid remains visible above the sheet. Closing the sheet does not cancel an in-progress pointer capture.

- [x] **Step 3: Show the selected event in that same sheet pattern**

When `selected` is set below `md`, render the existing title, time, attendees, description, and `Create Meeting Note` button in a bottom sheet using `responsiveDialogContentClass`'s mobile half (`max-h-[85dvh]` is fine for this one) and `bottom` above the tab bar. Close clears `selectedId`. Desktop keeps the right-hand panel.

- [x] **Step 4: Typecheck**

Run: `npm run typecheck --workspace=apps/web`
Expected: exit 0.

### Task 6: Graph fills the phone and accepts pinch

**Files:**
- Modify: `apps/web/src/pages/KnowledgeGraphPage.tsx`

**Interfaces:**
- Consumes: the shell inset from Task 1 (the graph's `flex-1 min-h-0` parent is already the full-bleed column)
- Produces: no new exports

- [x] **Step 1: Stop the browser from taking the pinch**

On the graph container, add `touch-pan-x` is wrong. Set `style.touchAction = 'none'` in addition to the existing background style. Do not change node colors, forces, or hit-area paint.

- [x] **Step 2: Turn zoom and pan on explicitly**

On `ForceGraph2D`, set `enablePointerInteraction`, `enableZoomInteraction`, and `enablePanInteraction` to `true`. Leave `minZoom` 0.25 and `maxZoom` 8. The existing `width` and `height` from the container resize observer stay the canvas size, so once Task 1 shortens the column, the canvas follows.

- [x] **Step 3: Typecheck**

Run: `npm run typecheck --workspace=apps/web`
Expected: exit 0.

### Task 7: Verify desktop is unchanged and the phone shell works

**Files:**
- None

**Interfaces:**
- Consumes: Tasks 1–6

- [x] **Step 1: Typecheck**

Run: `npm run typecheck --workspace=apps/web`
Expected: exit 0.

- [x] **Step 2: Browser, 1280×800, signed in**

Open `/`. The left sidebar lists Home through Graph. There is no bottom tab bar and no More button. Open Create Task from Tasks. The panel is centered, not stuck to the bottom. Open `/graph` and confirm the canvas is still in the area beside the sidebar.

- [x] **Step 3: Browser, 390×844**

Set `viewport-fit=cover` emulation if the tool allows, then:

- Sidebar and hamburger are absent. Bottom bar shows Home, Notes, Ask, Tasks. Ask navigates to `/ask`. More opens Calendar, Sources, and Graph.
- The last visible control on Tasks is not covered by the bar.
- Create Task is full width, `rounded-t-2xl`, with the zinc pill, and sits on the bottom.
- `/calendar` shows the day grid without the unscheduled column. Tasks opens a sheet that leaves the grid visible above it.
- `/graph` canvas fills the column above the tab bar. A two-finger pinch changes graph zoom and does not scale the document (`visualViewport.scale` stays 1).

- [x] **Step 4: Commit only after this plan is approved and the checks pass**

```bash
git add apps/web/index.html apps/web/src/components/AppShell.tsx apps/web/src/components/MobileTabBar.tsx apps/web/src/components/ui/responsiveDialog.ts apps/web/src/components/tasks/QuickAddDialog.tsx apps/web/src/components/tasks/TaskDetailDrawer.tsx apps/web/src/components/ask/AskCompanion.tsx apps/web/src/pages/TasksPage.tsx apps/web/src/pages/NotesPage.tsx apps/web/src/pages/SourcesPage.tsx apps/web/src/pages/AskUnmutePage.tsx apps/web/src/pages/DashboardPage.tsx apps/web/src/pages/CalendarPage.tsx apps/web/src/pages/KnowledgeGraphPage.tsx apps/web/src/index.css docs/superpowers/plans/2026-10-17-mobile-native-shell.md
git commit -m "feat(web): make the phone shell a native tab bar"
```

Do not add `.env`.

# Premium Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the last layer of depth, press feedback, and accent discipline to the existing zinc workspace without changing data, routing, or AI behavior.

**Architecture:** Class-only pass. Surfaces gain an inset white ring and, where they are empty or selected, a short vertical zinc gradient. Interactive controls share one motion string. Readable muted copy moves from zinc-500 to zinc-400. Chrome stays monochrome. The approved laser is limited to the idle microphone, Ask send buttons, and the Ask mode tabs.

**Chosen accent:** Laser. `bg-violet-500/15 text-violet-200 border border-violet-400/40 shadow-[0_0_15px_rgba(167,139,250,0.45)]` on the idle mic, the Ask page send button, the Ask companion send button, and the selected Ask tab. Recording stays rose. Graph node colors stay semantic.

**Tech Stack:** React 19, Tailwind CSS v4, existing components in `apps/web/src`.

**Spec:** Polish brief dated 2026-10-17. Builds on `docs/superpowers/plans/2026-10-17-linear-ui-revamp.md`. Do not reintroduce violet gradients on generic cards.

## Global Constraints

- No React Query, mutation, debounce, or route changes.
- Elevation is `ring-1 ring-inset ring-white/10` on cards and menus, `ring-white/5` on inputs. Keep the existing `border-zinc-800`. Do not add drop shadows for elevation.
- Empty and selected surfaces: `bg-gradient-to-b from-zinc-800/50 to-zinc-900/50`.
- Press feedback: `active:scale-[0.98]` plus `transition-all duration-200 ease-out` on buttons and clickable cards only. Not on text fields, the editor, or the graph canvas.
- `prefers-reduced-motion` in `apps/web/src/index.css` already zeroes transitions. Do not remove it.
- Headers that name a page or a note use `tracking-tight`.
- Muted readable text is `text-zinc-400` minimum. Icons and placeholders may stay `text-zinc-500`.
- Keyboard focus stays `focus:outline-none focus:ring-1 focus:ring-zinc-700` plus the global 1px outline. The note title and editor stay borderless.
- Recommended accent: monochrome (`bg-zinc-100 text-zinc-950`). Graph type colors are data and stay.
- Status colors stay: rose for recording and errors, amber for high priority and warnings, emerald for saved and live.

## Review Focus

- Note title and ProseMirror must not gain a ring or a press scale.
- `active:scale-[0.98]` must not sit on a parent that also contains a text caret.
- Ask companion and the task drawer must not overlap after class changes.
- Recording stop state stays rose so a live mic is obvious.
- Citation chips in chat must remain clickable and readable after the violet border is removed.

---

### Task 1: Shared surface and motion strings

**Files:**
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Consumes: existing `:focus-visible` and reduced-motion block
- Produces: no new runtime API. Later tasks paste the same class strings.

- [x] Do not add a new color token. Document these strings and reuse them verbatim:
  - Card: `ring-1 ring-inset ring-white/10`
  - Input: `ring-1 ring-inset ring-white/5`
  - Wash: `bg-gradient-to-b from-zinc-800/50 to-zinc-900/50`
  - Press: `transition-all duration-200 ease-out active:scale-[0.98]`

### Task 2: Cards, menus, and inputs

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx` (`Stat` link, `Widget` section)
- Modify: `apps/web/src/pages/TasksPage.tsx` (four stat cards, empty state, task row)
- Modify: `apps/web/src/pages/NotesPage.tsx` (search shell, note card, batch bar, AI menu, empty editor panel, linked-task input)
- Modify: `apps/web/src/components/ui/CustomSelect.tsx` (trigger and content)
- Modify: `apps/web/src/components/tasks/PriorityPicker.tsx` (trigger and content)
- Modify: `apps/web/src/components/CommandPalette.tsx` (panel)
- Modify: `apps/web/src/components/tasks/TaskDetailDrawer.tsx` (meta chips and source card)
- Modify: `apps/web/src/components/tasks/QuickAddDialog.tsx` (dialog panel)

**Interfaces:**
- Consumes: Task 1 class strings
- Produces: elevated surfaces only. Click handlers stay.

- [x] Add `ring-1 ring-inset ring-white/10` beside each existing `border-zinc-800` on the surfaces above.
- [x] Add the wash gradient to home widgets, task stat cards, note empty state, task empty state, and the selected note card (`isSelected` branch, currently `bg-zinc-900 border border-zinc-700`).
- [x] Add `ring-1 ring-inset ring-white/5` to search inputs in Notes and Tasks. Leave the note title class and `.ProseMirror` without a ring.

### Task 3: Press and hover

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx` (nav links, search, Ask, sign out)
- Modify: `apps/web/src/pages/DashboardPage.tsx` (`Stat`, `NoteRow`, `TaskRow`, `WorkflowRow`)
- Modify: `apps/web/src/pages/NotesPage.tsx` (New Note, note card, filter tabs, tag chips)
- Modify: `apps/web/src/pages/TasksPage.tsx` (New Task, task row)
- Modify: `apps/web/src/components/ask/AskCompanion.tsx` (trigger and send)

**Interfaces:**
- Consumes: Task 1 press string
- Produces: tactile controls. `stopPropagation` on task checkbox, priority, date, and delete stays.

- [x] Append `transition-all duration-200 ease-out active:scale-[0.98]` to those buttons and rows.
- [x] Replace leftover `transition-colors` on those same nodes so they do not fight `transition-all`.
- [x] Do not add press scale to checkboxes, the editor, or `ForceGraph2D`.

### Task 4: Type

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx` (page title `h2`)
- Modify: `apps/web/src/pages/DashboardPage.tsx` (`h1`, widget `h2`, stat label, row meta)
- Modify: `apps/web/src/pages/NotesPage.tsx` (list title, empty copy, AI menu descriptions)
- Modify: `apps/web/src/pages/TasksPage.tsx` (`h1`, stat labels)
- Modify: `apps/web/src/components/tasks/TaskDetailDrawer.tsx` (title already `tracking-tight`; eyebrow copy)

**Interfaces:**
- Consumes: current sentence-case labels
- Produces: tighter headers and zinc-400 secondary copy

- [x] Add `tracking-tight` to page titles that lack it: AppShell `h2`, Dashboard `h1` if missing, Notes list `h1`, Tasks `h1`.
- [x] Change readable secondary lines from `text-zinc-500` to `text-zinc-400`: dashboard name and timestamps, note-card meta, AI menu subtitles, drawer eyebrows, task stat labels.
- [x] Leave icon-only `text-zinc-500` and `placeholder:text-zinc-500`.

### Task 5: Monochrome accent

**Files:**
- Modify: `apps/web/src/pages/SourcesPage.tsx` (idle mic button, about line 411)
- Modify: `apps/web/src/pages/AskUnmutePage.tsx` (hero mark, RAG badge, tab selected state, send button)
- Modify: `apps/web/src/components/ask/ChatTranscript.tsx` (assistant mark, bubble, citation chip)
- Modify: `apps/web/src/components/RichTextEditor.tsx` (bubble active state, link popover apply, slash selection, AI hint bar)
- Modify: `apps/web/src/pages/NotesPage.tsx` (leftover `text-violet-400` icons and the saving label)
- Modify: `apps/web/src/pages/KnowledgeGraphPage.tsx` (header `Waypoints` icon only)

**Interfaces:**
- Consumes: Task 1 press string on buttons that are already clickable
- Produces: one accent, zinc-100 on zinc-950. Recording stays rose.

- [x] Idle mic uses the laser fill. Recording stays `bg-rose-600`.
- [x] Ask hero and RAG badge go zinc. The selected Ask tab and both Ask send buttons use the laser fill. Inactive tabs stay `text-zinc-400`.
- [x] Assistant bubble becomes `border-zinc-800 ring-1 ring-inset ring-white/10 bg-zinc-900`. Citation chip becomes `border-zinc-700 bg-zinc-900 text-zinc-200`.
- [x] Editor active marks become `bg-zinc-100 text-zinc-950` instead of `bg-violet-600 text-white`. Slash-menu selected row matches that. Link color in the editor becomes `text-zinc-200 underline`.
- [x] Notes chrome icons (`Sparkles`, `FileText`, `CheckSquare`) become `text-zinc-400`. Graph toolbar icon becomes `text-zinc-300`.
- [x] Do not recolor graph node fills in `nodeColor` (`#a78bfa`, `#34d399`, `#fbbf24`, `#38bdf8`). Those distinguish types.

### Task 6: Verify, do not expand

- [x] `npm run typecheck --workspace=apps/web`
- [x] Browser: Home cards show an inner edge; a note title has no box; Sources idle mic and Ask send use the laser; recording stays rose.
- [x] Commit only the files in Tasks 2–5 plus this plan if it is still untracked. No logic diffs.

## Alternative, if monochrome is rejected

Replace Task 5 only. Keep Tasks 1–4.

Use one laser, not a gradient: `text-violet-200` and `shadow-[0_0_15px_rgba(167,139,250,0.45)]` on the idle mic, the Ask send button, and the Ask selected tab. Fill those three controls with `bg-violet-500/15 border border-violet-400/40`, not `from-violet-600 to-indigo-600`. Everything else in Task 5 still goes zinc. Graph node colors stay as they are.

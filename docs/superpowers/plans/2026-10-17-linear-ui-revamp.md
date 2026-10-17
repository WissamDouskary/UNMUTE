# Linear Dark UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the web app as a dense zinc Linear-style tool without changing queries, state, or AI behavior.

**Architecture:** Retune global focus and surface tokens in `index.css`, then replace presentational class strings in the shell, home, notes, and tasks. Primary actions become zinc-100 on zinc-950. Violet gradients and uppercase eyebrows come out. Status color (red, amber, emerald) stays only for meaning.

**Tech Stack:** React 19, Tailwind CSS v4, existing CSS variables in `apps/web/src/index.css`.

**Spec:** User brief in the revamp request. The ui-ux-pro-max search returned a teal light Swiss palette; it is rejected because the brief pins zinc-950 / zinc-900 / zinc-800.

## Global Constraints

- Backgrounds: `bg-zinc-950` pages, `bg-zinc-900` cards.
- Borders: `border-zinc-800` or `border-white/5`. No heavy drop shadows for elevation.
- Text: `text-zinc-100` or `text-zinc-200` primary, `text-zinc-400` or `text-zinc-500` secondary.
- No decorative all-caps labels.
- Hover: `hover:bg-zinc-800/50`.
- Focus: `focus:outline-none focus:ring-1 focus:ring-zinc-700` plus a global `:focus-visible` 1px zinc-700 outline. Do not remove keyboard focus.
- Transitions: `transition-colors duration-200` on interactive surfaces. Respect `prefers-reduced-motion` already in `index.css`.
- Radius: `rounded-lg` or `rounded-xl`.
- Do not change React Query keys, mutation handlers, routes, or AI debounce logic.
- No neon card gradients. No generic blue primary buttons.

## Review Focus

- Keyboard focus must remain visible on sidebar links, icon buttons, and dialogs.
- Note title and editor input must stay borderless so the writing area does not gain a box ring.
- Task complete toggle, priority picker, and note save handlers must keep their click targets and `stopPropagation`.
- Ask companion must stay reachable and must not cover the task drawer.
- Mobile sidebar open/close must still work after class changes.

---

### Task 1: Tokens and focus

**Files:**
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Consumes: existing `--color-*` variables
- Produces: zinc focus ring, quieter day-picker selection, unchanged editor checkbox structure

- [ ] Change `:focus-visible` outline to `1px solid #3f3f46` with offset 2.
- [ ] Set day-picker selected day to `bg-zinc-100` and `text-zinc-950`, drop the violet gradient.
- [ ] Leave input and textarea outline suppressed.

### Task 2: Shell and home

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: existing nav items and dashboard queries
- Produces: muted active nav (`bg-zinc-800 text-zinc-100`), sentence-case home section titles

- [ ] Sidebar active state loses the accent fill and glow.
- [ ] Header becomes a single page title, height 12, zinc search and Ask controls.
- [ ] Home stats and widgets use `bg-zinc-900 border-zinc-800 rounded-lg` and sentence case.

### Task 3: Notes editor chrome

**Files:**
- Modify: `apps/web/src/pages/NotesPage.tsx`

**Interfaces:**
- Consumes: existing note mutations and AI handlers
- Produces: zinc primary buttons, quieter AI menu, `text-2xl` note title

- [ ] Replace violet gradient buttons and completed checkboxes with zinc fills.
- [ ] Note title becomes `text-2xl sm:text-3xl font-semibold text-zinc-100`.
- [ ] Do not edit mutation callbacks.

### Task 4: Tasks and drawer

**Files:**
- Modify: `apps/web/src/pages/TasksPage.tsx`
- Modify: `apps/web/src/components/tasks/TaskDetailDrawer.tsx`
- Modify: `apps/web/src/components/tasks/PriorityPicker.tsx`
- Modify: `apps/web/src/components/ui/CustomSelect.tsx`
- Modify: `apps/web/src/components/ui/DatePickerPopover.tsx`

**Interfaces:**
- Consumes: existing task mutations
- Produces: zinc checkbox, muted priority menu, sentence-case meta labels

- [ ] New Task button is `bg-zinc-100 text-zinc-950`.
- [ ] Stat labels drop uppercase. Checkbox loses the violet gradient.
- [ ] Drawer citation chip uses a zinc border. Focus rings use zinc-700.

### Task 5: Ask control

**Files:**
- Modify: `apps/web/src/components/ask/AskCompanion.tsx`

**Interfaces:**
- Consumes: existing dialog open state
- Produces: zinc pill trigger, no violet gradient

- [ ] Restyle the collapsed trigger and send button only. Do not change chat state.

### Task 6: Verify

- [ ] `npm run typecheck --workspace=apps/web`
- [ ] Open Home, Notes, and Tasks in the browser and confirm layout, focus, and the Ask button.
- [ ] Commit and push presentational files only.

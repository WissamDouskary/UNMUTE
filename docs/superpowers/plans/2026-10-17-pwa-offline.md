# PWA And Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the Vite web app installable as UNMUTE, with a zinc standalone shell that still opens when the network is gone.

**Architecture:** `vite-plugin-pwa` generates the manifest and a Workbox service worker at build time. Static assets are precached. Notes and tasks GET responses use NetworkFirst so a reload can show the last successful read. Mutations are not queued. A failed write while offline surfaces the exact copy "No connection". The install control listens for `beforeinstallprompt` and stays hidden in a standalone window.

**Tech Stack:** Vite 6, React 19, `vite-plugin-pwa`, Workbox via that plugin, TanStack Query.

**Spec:** User directive dated 2026-10-17. Theme values are `#09090b` for both `theme_color` and `background_color`. `registerType` is `autoUpdate`. Icon files are `pwa-192x192.png` and `pwa-512x512.png`.

## Global Constraints

- `name` and `short_name` are `UNMUTE`. `display` is `standalone`.
- `theme_color` and `background_color` are `#09090b`.
- Do not cache Ask, chat, transcription, or SSE. Those calls need the network.
- Do not promise local sync. Offline writes say "No connection".
- Install control is visible only when installation is possible and the app is not already standalone.
- Touch target is at least 44px tall, with an 8px gap from the profile row, a visible label, and the existing zinc focus ring.
- Do not change API contracts, React Query keys, or AI request bodies.

## Review Focus

- A refresh on a note route while offline must serve the app shell, not a browser error page.
- A notes or tasks GET that already succeeded online should be readable from the runtime cache after the network drops.
- An Ask or summarize call while offline must reject without taking down the React tree.
- A note save while offline must keep the existing "Sync failed" state and also show "No connection".
- The install control must not render inside an installed standalone window.

---

### Task 1: Plugin, manifest, and icons

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/index.html`
- Create: `apps/web/public/pwa-192x192.png`
- Create: `apps/web/public/pwa-512x512.png`

**Interfaces:**
- Consumes: existing Vite React and Tailwind plugins
- Produces: build output `manifest.webmanifest` and `sw.js`. Manifest fields `name`, `short_name`, `display`, `theme_color`, `background_color`.

- [x] Add `vite-plugin-pwa` to `apps/web` devDependencies.
- [x] Register `VitePWA` with `registerType: 'autoUpdate'` and `injectRegister: 'auto'`.
- [x] Manifest icons point at `/pwa-192x192.png` and `/pwa-512x512.png`. The 512 icon is also `purpose: 'maskable'`.
- [x] Workbox `globPatterns` include html, js, css, png, svg, ico, woff2. `navigateFallback` is `index.html`. `navigateFallbackDenylist` is `/api` and `/actuator`.
- [x] Runtime cache: NetworkFirst for GET `/api/v1/notes` and `/api/v1/tasks`, cache name `unmute-records`, timeout 4 seconds. CacheFirst for `fonts.googleapis.com` and `fonts.gstatic.com`.
- [x] Add `<meta name="theme-color" content="#09090b" />` in `index.html`.
- [x] Generate the two PNG icons: zinc-950 field, zinc mic mark, inset so a maskable crop still shows the mic.

### Task 2: Offline notice and install control

**Files:**
- Modify: `apps/web/src/main.tsx`
- Create: `apps/web/src/lib/connection.ts`
- Create: `apps/web/src/components/InstallAppButton.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `QueryClient` in `main.tsx`
- Produces: `isOfflineFailure(error: unknown): boolean`. Window event `unmute:offline`. Install button renders nothing unless `beforeinstallprompt` fired and display mode is not `standalone`.

- [x] `isOfflineFailure` is true when `navigator.onLine === false` or the error is a `TypeError`.
- [x] Query defaults set `throwOnError: false`. Mutation cache dispatches `unmute:offline` when `isOfflineFailure` is true.
- [x] AppShell shows a status line whose text is exactly `No connection` while offline, or for 4 seconds after that event if the browser still reports online.
- [x] Install button label is `Install App`, `min-h-11`, full sidebar width, `gap-2` above the profile row, `focus:ring-1 focus:ring-zinc-700`.

### Task 3: Verify

- [x] `npm run typecheck --workspace=apps/web`
- [x] `npm run build --workspace=apps/web` emits `manifest.webmanifest` and `sw.js`.
- [x] Browser: the shell still loads, the install control is absent in a normal tab until the browser offers install, and going offline shows `No connection` without a blank page.

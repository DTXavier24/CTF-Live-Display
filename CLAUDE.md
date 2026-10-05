# CLAUDE.md — IBOH 2026 Live Display

Live broadcast-style display for **International Battle of Hackers 2026 (IBOH 2026)**, a Jeopardy CTF running on **GZCTF**. A public screen shows live CTF action; an admin panel controls what gets featured.

The full feature spec is in `SPEC.md`. Read it before building any feature.

## Event facts
- Date: **14 November 2026**, venue timezone **GMT+8 (Asia/Kuala_Lumpur)**. All displayed times use this zone, regardless of server timezone.
- Two divisions: **Local** and **International**. Always use these exact labels in the UI.
- Scope: **Jeopardy only**. Attack & Defense is not on GZCTF and is out of scope.

## Stack
- **Frontend:** Vite + React + TypeScript, **Motion** (`motion/react`) for animation, Tailwind CSS.
- **Backend:** Node.js + TypeScript, Fastify, Socket.IO for pushing state to clients, `@microsoft/signalr` for the GZCTF hub, SQLite (`better-sqlite3`) for persisted state.
- One repo, two packages: `server/` and `web/`. The backend serves the built frontend.

## Routes
- `/display`: the public live screen. Kiosk mode, no user interaction, no visible cursor.
- `/admin`: control panel, protected by a shared password (`ADMIN_PASSWORD` env var, session cookie).

## Architecture rules
- **The browser never talks to GZCTF.** The backend logs in with a GZCTF admin account and is the only GZCTF client. Credentials live in `.env` on the VPS only and must never be sent to the frontend.
- **The backend owns all state** (queue, loop, phase, cached GZCTF data) and broadcasts it over Socket.IO. Display and admin are thin clients.
- **Persist** queue, loop config, announced bloods and the last scoreboard snapshot to SQLite, so a server restart neither loses the queue nor re-announces old bloods.
- **GZCTF data:** use the SignalR monitor hub for real-time submissions; poll REST for the scoreboard (every ~10s) and game details. If the hub disconnects, fall back to polling submissions until it reconnects.
- **Verify GZCTF endpoints against the deployed instance's OpenAPI docs** before writing the client. Do not guess field names; GZCTF changes between versions. Wrap every GZCTF response in a typed adapter (`server/src/gzctf/`) so the rest of the app never touches raw API shapes.

## Reliability rules (non-negotiable)
The display runs unattended for 10+ hours in front of an audience.
- **A failing event is skipped, never shown broken.** Every queue item has a load timeout (default 5s); if it can't render or its media fails, log it and advance.
- **Stale over blank.** If GZCTF is unreachable, keep showing last-known data with a small "data delayed" indicator. Never show an empty panel or a spinner on the display.
- The display auto-reconnects to the backend with backoff and resumes the current phase's default view.
- No memory growth: cap list lengths (e.g. the solve feed holds 10 items), clean up timers and listeners, don't accumulate DOM.
- Errors are caught per component (React error boundaries around each panel and each queue item).

## Display target
- Design for **1920×1080** exactly. Use a fixed 1920×1080 stage scaled to fit the window (letterboxed), not responsive layouts.
- Sponsor videos play **muted**. No audio anywhere.
- Use tabular/monospace numerals for all timers and scores so digits don't jitter.

## Design language
Futuristic, technical, esports-broadcast feel (think Valorant / LoL Worlds overlays).
- Background: near-black `#050607` (from battleofhackers.com).
- Accent colors: **TODO**: fill in brand hex values. (Claude decide what's suitable)
- Fonts: **TODO**: fill in heading and body fonts (with fallbacks). (Refer to sample.css for reference)
- Brand assets in `web/public/brand/`: logo, mascot, posters. **TODO**: add files.
- Motion vocabulary: glitch/scanline transitions, slide-and-wipe reveals, number count-ups, subtle grid/noise backgrounds. Animations are smooth and readable from the back of a hall. No rapid flashing.

## Conventions
- TypeScript strict mode everywhere. Shared types for socket messages and queue items live in `shared/`.
- Each event type is a **template**: a React component plus a typed payload schema (zod) plus a default duration. Adding a new event type must not require touching the queue engine.
- Config in `.env` (see `.env.example`): `GZCTF_BASE_URL`, `GZCTF_GAME_ID`, `GZCTF_USERNAME`, `GZCTF_PASSWORD`, `ADMIN_PASSWORD`, `PORT`.
- Include a **mock GZCTF mode** (`MOCK_GZCTF=1`) that simulates teams, solves, bloods and rank changes, so the whole app can be developed and rehearsed without a live game.

## GZCTF version
- For API reference can find here: https://gzctf.gzti.me/scalar#description/introduction
- Actual GZCTF fork version (No AD, only pure jeopardy): https://dimasc.tf/GZCTF/

## Commands
- `npm run dev`: server + web with hot reload
- `npm run dev:mock`: same, with mock GZCTF data
- `npm run build` / `npm start`: production build and serve

## Testing Server
- https://192.168.150.128
- username: admin
- password: Aa133530e8edecfc5900038548a

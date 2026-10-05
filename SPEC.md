# SPEC.md — IBOH 2026 Live Display

## 1. Phases
The display has three phases. They switch **automatically** from the GZCTF game's start/end times, and the admin panel has a manual override.

| Phase | When | Default view |
|---|---|---|
| `pre` | before start | Pre-CTF page |
| `live` | start → end | Live layout |
| `ended` | after end | Closing statement |

### 1.1 Pre-CTF page
- IBOH 2026 branding (logo, mascot, event date).
- Large countdown to CTF start (GMT+8).
- Sponsor logo ticker along the bottom.
- Queue items (announcements, sponsor videos) can still play over it.

### 1.2 Live layout (1920×1080)
```
┌──────────────────────────────────────────────┐
│ TOP: logo · countdown to end · phase label   │
├─────────┬──────────────────────┬─────────────┤
│ LEFT    │ CENTER               │ RIGHT       │
│ Live    │ Featured events      │ Latest 10   │
│ stats   │ (queue / loop)       │ solves      │
├─────────┴──────────────────────┴─────────────┤
│ BOTTOM: infinite scrolling sponsor logos     │
└──────────────────────────────────────────────┘
```
- **Top:** time remaining until CTF end, large and always visible.
- **Left, live stats:** total teams, total solves, flags per minute (rolling 5-min window), split by Local / International where it makes sense. Numbers animate on change.
- **Center:** the current queue item. When the queue is empty, the default loop plays here.
- **Right, latest 10 solves:** newest on top, slide-in animation. Each row: team, division tag (Local/International), challenge, time. Blood solves get a highlighted style.
- **Bottom:** seamless infinite scroll of sponsor logos.

### 1.3 Ended page
- Statement: **"IBOH 2026 has officially ended. Please proceed to {venue}."**
- `{venue}` is an editable field in the admin panel.
- Optionally show the final Top 10 for each division, alternating.

### 1.4 Final hour mode (live phase, T-60 min → end)
A visual state of the live layout, not a separate phase. It turns on automatically at 60 minutes before the end. The admin can toggle it, and the trigger time is configurable.
- Accent palette shifts to red/alert tones, with a brief full-screen transition when it activates ("FINAL HOUR").
- The top timer grows larger and gains a pulse on each minute tick.
- The **left panel switches from live stats to the top 3 of each division** (Local stacked above International), updating live with rank-change animations.
- The sponsor ticker speeds up slightly.
- The queue and loop keep running normally.

### 1.5 Final 10-second countdown (T-10s → end)
- At 10 seconds before the end, a **full-screen takeover** shows a huge 10 → 0 countdown, driven by the backend clock.
- This is the **only event allowed to interrupt the currently playing item**, regardless of priority. Queue and loop are paused.
- At 0 it transitions straight into the `ended` phase with a dramatic hit (flash/glitch into the closing statement).
- If the admin extends the game end time in GZCTF, the countdown cancels cleanly and the live layout resumes.

## 2. Event templates
Each template has a payload schema, a default duration (admin can override per item), and a default priority.

| Template | Data source | Default duration | Default priority |
|---|---|---|---|
| Countdown to start | game start time | 15s | normal |
| Countdown to end | game end time | 15s | normal |
| Blood (1st/2nd/3rd) | per-division blood detector | 8s | high |
| Sponsor video | uploaded video file | video length | normal |
| Top 10 scoreboard | GZCTF scoreboard | 15s per division | normal |
| Unsolved challenges | GZCTF challenges + scoreboard | 15s | normal |
| Announcement | typed in admin panel | 12s | high |
| Takeover | scoreboard diff | 10s | high |
| The Wall Falls | solve stream + challenge history | 10s | high |
| On Fire | solve stream | 8s | normal |
| Milestone | global solve counter | 8s | normal |
| Team spotlight | scoreboard | 12s | normal (loop) |

Takeover, The Wall Falls, On Fire and Milestone are **auto-events**: the backend detects and queues them, like bloods. Every auto-event is **re-validated at play time**. If it's no longer true or too old (default: detected more than 5 minutes before it would play), it is skipped silently rather than shown stale.

### 2.1 Bloods (per division)
- Each division gets its own 1st, 2nd and 3rd blood for every challenge. GZCTF's native blood events are global, so **do not rely on them**. The backend computes per-division bloods itself from the solve stream: the first three correct solves on a challenge by teams within the same division.
- Card shows: blood rank (1st/2nd/3rd with distinct styling), division, team name, solving player's name, challenge name and category, solve time.
- **Every blood is queued individually**, in solve-time order, even during the opening rush.
- Each (challenge, division, rank) is announced **once only**, tracked in SQLite. On startup, rebuild blood state from GZCTF history without re-announcing.

### 2.2 Top 10 scoreboard
- Shows **two boards that alternate**: Local, then International.
- Animate rank changes compared to the previous snapshot shown for that division: rows physically move to their new positions (Motion layout animations), with ▲/▼ indicators and the number of places moved. Teams new to the top 10 slide in, and teams that drop out slide out.
- Columns: rank, team, score, solve count.

### 2.3 Unsolved challenges
- Challenges with zero solves, grouped by category. Names and categories only, never descriptions or hints.
- If everything is solved, the item is skipped automatically.

### 2.4 Sponsor video
- Videos are uploaded in the admin panel and stored on the server. They play muted and scale to fit the center area.
- If a video fails to load within 5s or errors mid-play, skip it.

### 2.5 Announcement
- Admin types a title and body, then picks normal or high priority.
- Full-width takeover styling, distinct from other cards.

### 2.6 Takeover
- Fires when a team takes **#1 in its division** from another team (detected from scoreboard snapshot diffs).
- Versus-style card: the new leader and the dethroned team, with names, scores and the point gap, animating past each other into their new order. Division label is prominent.
- **Cooldown:** at most one Takeover per division every **15 minutes** (configurable). Detections during the cooldown are dropped, not delayed.
- **Anti-flip-flop:** if the same two teams keep swapping #1, only the first swap within the cooldown window is shown.
- Re-validate at play time: if the new leader no longer holds #1, skip.

### 2.7 The Wall Falls
- Fires when a challenge that has had **zero solves for 3+ hours** (configurable, measured from the challenge's release or game start) gets its first solve from any team.
- Card shows the challenge name and category, how long it stood ("UNSOLVED FOR 4H 12M"), and the solving team, player and division.
- Visual: a wall/barrier shattering or breaking apart to reveal the team.
- Fires once per challenge. If it fires, it plays instead of that solve's 1st-blood card for the solver's division, not in addition to it. The other division's bloods for that challenge still play normally later.

### 2.8 On Fire
- Fires when a team solves **3 or more challenges within 10 minutes** (both configurable).
- Card shows the team, division, the challenges in the streak, and the streak count, with a flame/heat effect.
- Cooldown: at most once per team every **30 minutes**.

### 2.9 Milestone
- Fires when the event's **total correct solves** (both divisions combined) hits a milestone: 100, 250, 500, 750, 1000 by default (configurable list).
- Card shows the big milestone number counting up, plus the team and player who captured that flag.
- Each milestone fires once only, tracked in SQLite.

### 2.10 Team spotlight
- Loop template. Picks a random team with at least 1 solve, preferring teams **outside the top 10** of their division, and not spotlighted in the last 10 spotlights.
- Card shows the team name, division, current rank, score, solve count, strongest category (most solves), and player names.
- If no eligible team exists, skip.

## 3. Queue and loop engine (backend)
- **Queue:** an ordered list of items waiting to play.
- **Priority:** `high` items jump ahead of all `normal` items but **wait for the current item to finish**. They never interrupt it. Multiple high items keep FIFO order among themselves. The one exception is the final 10-second countdown (§1.5), a system event that interrupts anything.
- **Default loop:** an admin-configured, ordered list of templates that plays whenever the queue is empty (for example: scoreboard → sponsor video → unsolved → sponsor video → countdown to end). Live data templates fetch fresh data each time they come up.
- When a queue item arrives while the loop is playing, the loop item finishes first, then the queue takes over. The loop resumes where it left off.
- **Skip on error:** any item that fails validation, fails to load within its timeout, or throws while rendering is skipped and logged. The engine never stalls.
- The engine runs on the backend clock. The display only renders what it is told and reports `ready`, `done` or `error` back to the server.

## 4. Admin panel (`/admin`)
- **Login** with the shared password.
- **Now playing:** the current item, its time remaining, and a "skip now" button.
- **Queue:** list of upcoming items with drag-to-reorder, delete, edit duration, and change priority.
- **Add from template:** pick a template, fill in its fields (with live preview), choose priority, then add to the queue.
- **Default loop editor:** add, remove and reorder loop entries, set durations, and toggle the loop on or off.
- **Auto-events:** an on/off toggle for each auto-event (bloods, Takeover, The Wall Falls, On Fire, Milestone), plus editable thresholds and cooldowns: takeover cooldown, wall-falls hours, on-fire count/window/cooldown, and the milestone list.
- **Final stretch:** toggle final hour mode and set its start time (default T-60 min). Toggle the final 10-second countdown.
- **Phase control:** shows the current phase (auto) with a manual override (`pre` / `live` / `ended` / `auto`).
- **Settings:** venue name, sponsor logo uploads for the ticker, sponsor video uploads.
- **Health:** GZCTF connection status (hub and polling), last successful fetch time, connected display clients, and a recent errors log.
- **Preview:** a small live mirror of what `/display` is currently showing.

## 5. Acceptance checklist
- [ ] Runs end-to-end in `MOCK_GZCTF=1` mode with simulated solves, bloods and rank changes.
- [ ] Phases switch automatically at start and end times (GMT+8).
- [ ] Per-division bloods are correct and never duplicated, including after a server restart.
- [ ] Killing GZCTF mid-event leaves the display showing stale data with a delay indicator, and it recovers automatically.
- [ ] Killing the backend: the display reconnects and resumes on restart, and the queue is intact.
- [ ] A broken video or invalid item is skipped without a visible glitch.
- [ ] Runs 12 hours in mock mode without memory growth (check in Chrome DevTools).
- [ ] Looks correct at 1920×1080 in Chrome kiosk mode.
- [ ] Mock mode can trigger every auto-event on demand (Takeover, Wall Falls, On Fire, Milestone) for rehearsal.
- [ ] Takeover respects its cooldown under rapid #1 flip-flopping.
- [ ] Final hour mode activates at T-60 and the final countdown lands exactly on the game end time, then enters `ended`.
- [ ] Extending the end time in GZCTF during the final countdown cancels it cleanly.

import type { ClientToServerEvents, DisplayState, Division, FinalStretch, Game, NowPlaying, Phase, PhaseOverride, ServerToClientEvents, Solve } from '@iboh/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Server } from 'socket.io';
import { config } from './config.js';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { kv } from './db.js';
import type { Detectors } from './detectors.js';
import type { GzctfSource } from './gzctf/source.js';
import { listMedia, mediaUrl } from './media.js';
import type { TemplateContext } from './templates.js';

const FEED_SIZE = 8;
const RATE_WINDOW_MS = 5 * 60_000;
const POLL_MS = 10_000;
/** In the last minutes, poll fast so an extended end time cancels the countdown in time. */
const FAST_POLL_MS = 2000;
const FAST_POLL_WINDOW_MS = 2 * 60_000;
const COUNTDOWN_MS = 10_000;

/** mtime of the built index.html: changes on every redeploy, stable across restarts. */
function buildId() {
  try {
    return String(statSync(fileURLToPath(new URL('../../web/dist/index.html', import.meta.url))).mtimeMs);
  } catch {
    return null; // dev: Vite serves the page and hot-reloads it
  }
}

/** Admin settings that the display reads. */
const FINAL_DEFAULTS: FinalStretch = { finalHour: 'auto', finalHourMin: 60, finalCountdown: true, endedTop10: true };
export const settings = {
  phaseOverride: kv.get<PhaseOverride>('phaseOverride') ?? 'auto',
  venue: kv.get<string>('venue') ?? 'the main hall',
  finalStretch: { ...FINAL_DEFAULTS, ...kv.get<Partial<FinalStretch>>('finalStretch') },
};
export function saveSettings(next: Partial<typeof settings>) {
  Object.assign(settings, next);
  kv.set('phaseOverride', settings.phaseOverride);
  kv.set('venue', settings.venue);
  kv.set('finalStretch', settings.finalStretch);
}

/** Everything about "what the screen is in" that can flip on the clock alone. */
export function modeAt(game: Game | null, now: number) {
  const phase = phaseAt(game, now);
  const left = game ? game.end - now : Infinity;
  const f = settings.finalStretch;
  const live = phase === 'live';
  return {
    phase,
    finalHour: live && f.finalHour !== 'off' && (f.finalHour === 'on' || (left > 0 && left <= f.finalHourMin * 60_000)),
    // Only on the real clock: a manual phase override never triggers the end-of-game sequence.
    countdown: live && f.finalCountdown && settings.phaseOverride === 'auto' && left > 0 && left <= COUNTDOWN_MS,
  };
}
export type Mode = ReturnType<typeof modeAt>;

/** Phase from the game clock, unless the admin overrides it. */
export function phaseAt(game: Game | null, now: number): Phase {
  if (settings.phaseOverride !== 'auto') return settings.phaseOverride;
  if (!game || now < game.start) return 'pre';
  return now < game.end ? 'live' : 'ended';
}

export function startState(
  source: GzctfSource,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  log: FastifyBaseLogger,
  detectors: Detectors,
) {
  // Last-known data survives restarts: stale over blank.
  let game = kv.get<Game>('game') ?? null;
  let scoreboard = kv.get<DisplayState['scoreboard']>('scoreboard') ?? { entries: [], challenges: [] };
  let solves = kv.get<Solve[]>('solves') ?? [];
  // Solve ids already handled. Until the first scoreboard arrives, history is unknown.
  const seen = new Set(solves.map((s) => s.id));
  let primed = false;
  let recent: { time: number; division: Division }[] = [];
  let dataDelayed = true; // until the first successful fetch
  let lastMode = '';
  const modeListeners: ((mode: Mode) => void)[] = [];
  let getNow: () => NowPlaying | null = () => null;
  let lastFetchOk: number | null = null;
  let lastFetchError: string | null = null;

  function snapshot(): DisplayState {
    const now = Date.now();
    recent = recent.filter((r) => now - r.time < RATE_WINDOW_MS);
    const count = (d: Division) => scoreboard.entries.filter((e) => e.division === d);
    const sum = (d: Division) => count(d).reduce((n, e) => n + e.solvedCount, 0);
    const rate = (d: Division) => recent.filter((r) => r.division === d).length / (RATE_WINDOW_MS / 60_000);
    const mode = modeAt(game, now);
    return {
      phase: mode.phase,
      game,
      scoreboard,
      solves,
      stats: {
        teams: { Local: count('Local').length, International: count('International').length },
        solves: { Local: sum('Local'), International: sum('International') },
        flagsPerMin: { Local: rate('Local'), International: rate('International') },
      },
      dataDelayed,
      serverTime: now,
      mock: config.mock,
      now: getNow(),
      buildId: buildId(),
      venue: settings.venue,
      logos: listMedia('logos').map((f) => mediaUrl('logos', f)),
      finalHour: mode.finalHour,
      finalCountdown: settings.finalStretch.finalCountdown && settings.phaseOverride === 'auto',
      endedTop10: settings.finalStretch.endedTop10,
    };
  }

  const push = () => io.emit('state', snapshot());

  /** Hub and scoreboard diff both land here; the shared id makes it once-only. */
  function addSolve(solve: Solve) {
    if (seen.has(solve.id)) return false;
    seen.add(solve.id);
    // Detectors queue bloods/streaks/milestones and tell us the blood rank for the feed highlight.
    solve = { ...solve, blood: detectors.onSolve(solve) };
    solves = [solve, ...solves].sort((a, b) => b.time - a.time).slice(0, FEED_SIZE);
    recent.push({ time: solve.time, division: solve.division });
    return true;
  }

  source.onSolve((solve) => {
    if (!addSolve(solve)) return;
    kv.set('solves', solves);
    push();
  });

  function syncHistory(history: Solve[]) {
    if (!primed) {
      // Boot: everything so far is history, not news. Seed an empty feed so it's never blank.
      detectors.prime(history);
      if (!solves.length) solves = [...history].sort((a, b) => b.time - a.time).slice(0, FEED_SIZE);
      solves = solves.map((s) => ({ ...s, blood: detectors.bloodOf(s) }));
      history.forEach((s) => seen.add(s.id));
      primed = true;
    } else {
      // Anything the hub missed (disconnected, or unknown team at the time).
      history
        .filter((s) => !seen.has(s.id))
        .sort((a, b) => a.time - b.time)
        .forEach(addSolve);
    }
    kv.set('solves', solves);
  }

  async function poll() {
    try {
      const [g, board] = await Promise.all([source.getGame(), source.getScoreboard()]);
      game = g;
      scoreboard = { entries: board.entries, challenges: board.challenges };
      syncHistory(board.solves);
      detectors.onScoreboard(board.entries, board.challenges, game);
      kv.set('game', game);
      kv.set('scoreboard', scoreboard);
      dataDelayed = false;
      lastFetchOk = Date.now();
      lastFetchError = null;
    } catch (err) {
      dataDelayed = true;
      lastFetchError = err instanceof Error ? err.message : String(err);
      log.warn({ err }, 'GZCTF poll failed, keeping last-known data');
    }
    push();
  }

  // Poll on a chain so the interval can tighten near the end of the game.
  async function pollLoop() {
    await poll();
    const left = game ? game.end - Date.now() : Infinity;
    const near = phaseAt(game, Date.now()) === 'live' && left < FAST_POLL_WINDOW_MS && left > -5000;
    setTimeout(pollLoop, near ? FAST_POLL_MS : POLL_MS);
  }
  void pollLoop();
  // Phase, final hour and the countdown flip on the clock: check often, push only on change.
  setInterval(() => {
    const mode = modeAt(game, Date.now());
    const key = JSON.stringify(mode);
    if (key === lastMode) return;
    lastMode = key;
    modeListeners.forEach((cb) => cb(mode));
    push();
  }, 250);

  io.on('connection', (socket) => socket.emit('state', snapshot()));

  return {
    push,
    refresh: poll,
    game: () => game,
    health: () => ({ lastFetchOk, lastFetchError }),
    context: (): TemplateContext => {
      const mode = modeAt(game, Date.now());
      return { game, scoreboard, phase: mode.phase, paused: mode.countdown, now: Date.now(), solves: detectors.solves() };
    },
    mode: () => modeAt(game, Date.now()),
    onModeChange(cb: (mode: Mode) => void) {
      modeListeners.push(cb);
    },
    setNowPlaying(fn: () => NowPlaying | null) {
      getNow = fn;
    },
  };
}

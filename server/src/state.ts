import type { ClientToServerEvents, DisplayState, Division, Game, NowPlaying, Phase, ServerToClientEvents, Solve } from '@iboh/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Server } from 'socket.io';
import { config } from './config.js';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { kv } from './db.js';
import type { Detectors } from './detectors.js';
import type { GzctfSource } from './gzctf/source.js';
import type { TemplateContext } from './templates.js';

const FEED_SIZE = 8;
const RATE_WINDOW_MS = 5 * 60_000;
const POLL_MS = 10_000;

/** mtime of the built index.html: changes on every redeploy, stable across restarts. */
function buildId() {
  try {
    return String(statSync(fileURLToPath(new URL('../../web/dist/index.html', import.meta.url))).mtimeMs);
  } catch {
    return null; // dev: Vite serves the page and hot-reloads it
  }
}

export function phaseAt(game: Game | null, now: number): Phase {
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
  let lastPhase: Phase | null = null;
  let getNow: () => NowPlaying | null = () => null;

  function snapshot(): DisplayState {
    const now = Date.now();
    recent = recent.filter((r) => now - r.time < RATE_WINDOW_MS);
    const count = (d: Division) => scoreboard.entries.filter((e) => e.division === d);
    const sum = (d: Division) => count(d).reduce((n, e) => n + e.solvedCount, 0);
    const rate = (d: Division) => recent.filter((r) => r.division === d).length / (RATE_WINDOW_MS / 60_000);
    return {
      phase: phaseAt(game, now),
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
    };
  }

  const push = () => {
    const s = snapshot();
    lastPhase = s.phase;
    io.emit('state', s);
  };

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
    } catch (err) {
      dataDelayed = true;
      log.warn({ err }, 'GZCTF poll failed, keeping last-known data');
    }
    push();
  }

  void poll();
  setInterval(poll, POLL_MS);
  // Push promptly when the phase flips at start/end, rather than waiting for the next poll.
  setInterval(() => {
    if (phaseAt(game, Date.now()) !== lastPhase) push();
  }, 1000);

  io.on('connection', (socket) => socket.emit('state', snapshot()));

  return {
    push,
    refresh: poll,
    context: (): TemplateContext => ({ game, scoreboard, phase: phaseAt(game, Date.now()), now: Date.now(), solves: detectors.solves() }),
    setNowPlaying(fn: () => NowPlaying | null) {
      getNow = fn;
    },
  };
}

import type { DisplayState, Division, Game, Phase, ServerToClientEvents, Solve } from '@iboh/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Server } from 'socket.io';
import { config } from './config.js';
import { kv } from './db.js';
import type { GzctfSource } from './gzctf/source.js';

const FEED_SIZE = 10;
const RATE_WINDOW_MS = 5 * 60_000;
const POLL_MS = 10_000;

export function phaseAt(game: Game | null, now: number): Phase {
  if (!game || now < game.start) return 'pre';
  return now < game.end ? 'live' : 'ended';
}

export function startState(source: GzctfSource, io: Server<{}, ServerToClientEvents>, log: FastifyBaseLogger) {
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
      if (!solves.length) solves = [...history].sort((a, b) => b.time - a.time).slice(0, FEED_SIZE);
      history.forEach((s) => seen.add(s.id));
      primed = true;
    } else {
      // Anything the hub missed (disconnected, or unknown team at the time).
      history.filter((s) => !seen.has(s.id)).forEach(addSolve);
    }
    kv.set('solves', solves);
  }

  async function poll() {
    try {
      const [g, board] = await Promise.all([source.getGame(), source.getScoreboard()]);
      game = g;
      scoreboard = { entries: board.entries, challenges: board.challenges };
      syncHistory(board.solves);
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
}

import type { DisplayState, Division, Game, Phase, Scoreboard, ServerToClientEvents, Solve } from '@iboh/shared';
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
  let scoreboard = kv.get<Scoreboard>('scoreboard') ?? { entries: [], challenges: [] };
  let solves = kv.get<Solve[]>('solves') ?? [];
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

  source.onSolve((solve) => {
    solves = [solve, ...solves].slice(0, FEED_SIZE);
    recent.push({ time: solve.time, division: solve.division });
    kv.set('solves', solves);
    push();
  });

  async function poll() {
    try {
      [game, scoreboard] = await Promise.all([source.getGame(), source.getScoreboard()]);
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

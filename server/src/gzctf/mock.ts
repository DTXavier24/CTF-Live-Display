import type { Challenge, Division, ScoreEntry, Solve } from '@iboh/shared';
import { config } from '../config.js';
import type { GzctfSource } from './source.js';

const ADJ = ['Null', 'Rogue', 'Silent', 'Binary', 'Crimson', 'Phantom', 'Quantum', 'Shadow', 'Static', 'Iron', 'Neon', 'Zero'];
const NOUN = ['Pointers', 'Sockets', 'Daemons', 'Vipers'];
const FIRST = ['Aiman', 'Wei Jie', 'Priya', 'Hafiz', 'Mei Ling', 'Arjun', 'Kai', 'Sofia', 'Jonas', 'Yuki', 'Omar', 'Lena', 'Ravi', 'Hana', 'Diego', 'Nur'];
const CATS: Record<string, string[]> = {
  Web: ['Cookie Monster', 'SSRF Express', 'Template Trouble', 'Admin Panel 2.0'],
  Pwn: ['Stack Smash', 'Heap of Trouble', 'ret2win', 'Format Fiesta'],
  Crypto: ['Baby RSA', 'XOR Party', 'Lattice Lane', 'Padding Oracle'],
  Rev: ['Crackme', 'Obfuscated', 'VM Escape', 'Go Figure'],
  Forensics: ['Packet Hunt', 'Memory Lane', 'Stego Cat', 'Disk Detective'],
  Misc: ['Sanity Check', 'Jail Break', 'OSINT Trail', 'QR Chaos'],
};

interface MockTeam {
  id: number;
  name: string;
  division: Division;
  players: string[];
  skill: number;
  solved: Map<number, Solve>; // challengeId -> solve
}

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

/** Roulette pick: chance proportional to weight. */
function weighted<T>(xs: T[], weight: (x: T) => number): T {
  let r = Math.random() * xs.reduce((n, x) => n + weight(x), 0);
  for (const x of xs) if ((r -= weight(x)) <= 0) return x;
  return xs[xs.length - 1]!;
}

export function createMockSource(): GzctfSource {
  const start = Date.now() - config.mockStartOffsetMin * 60_000;
  const end = start + config.mockDurationMin * 60_000;

  const teams: MockTeam[] = Array.from({ length: 48 }, (_, i) => ({
    id: i + 1,
    name: `${ADJ[i % 12]} ${NOUN[Math.floor(i / 12)]}`,
    division: i % 2 === 0 ? 'Local' : 'International',
    players: Array.from({ length: 3 }, () => pick(FIRST)),
    skill: 0.2 + Math.random() * 0.8,
    solved: new Map(),
  }));

  let nextId = 1;
  const challenges = Object.entries(CATS).flatMap(([category, titles]) =>
    titles.map((title, i) => ({ id: nextId++, title, category, points: 100 * (i + 1) })),
  );

  const listeners: ((s: Solve) => void)[] = [];

  /** Stronger teams solve more often; cheaper (easier) challenges fall first. */
  function simulateSolve(time: number): Solve | null {
    const candidates = teams.filter((t) => t.solved.size < challenges.length);
    if (!candidates.length) return null;
    const team = weighted(candidates, (t) => t.skill);
    const open = challenges.filter((c) => !team.solved.has(c.id));
    const chal = weighted(open, (c) => 1 / c.points ** 2);
    const solve: Solve = {
      id: `${team.id}-${chal.id}`,
      teamId: team.id,
      teamName: team.name,
      division: team.division,
      player: pick(team.players),
      challengeId: chal.id,
      challenge: chal.title,
      category: chal.category,
      time,
    };
    team.solved.set(chal.id, solve);
    return solve;
  }

  // Backfill history for the time already elapsed, so the scoreboard isn't empty on boot.
  const interval = config.mockSolveIntervalSec * 1000;
  for (let t = start + interval; t < Math.min(Date.now(), end); t += interval * (0.5 + Math.random())) {
    simulateSolve(t);
  }

  function tick() {
    const now = Date.now();
    if (now >= start && now < end) {
      const solve = simulateSolve(now);
      if (solve) listeners.forEach((cb) => cb(solve));
    }
    setTimeout(tick, interval * (0.5 + Math.random()));
  }
  tick();

  // Skill drift so ranks keep changing.
  setInterval(() => {
    for (const t of teams) t.skill = Math.min(1, Math.max(0.1, t.skill + (Math.random() - 0.5) * 0.3));
  }, 3 * 60_000);

  return {
    async getGame() {
      return { title: 'IBOH 2026 (mock)', start, end };
    },
    async getScoreboard() {
      const points = new Map(challenges.map((c) => [c.id, c.points]));
      const rows = teams.map((t) => {
        let score = 0;
        let last = 0;
        for (const s of t.solved.values()) {
          score += points.get(s.challengeId)!;
          last = Math.max(last, s.time);
        }
        return { t, score, last };
      });
      // Ties broken by who got there first, like GZCTF.
      rows.sort((a, b) => b.score - a.score || a.last - b.last);
      const rankIn: Record<Division, number> = { Local: 0, International: 0 };
      const entries: ScoreEntry[] = rows.map(({ t, score }) => ({
        teamId: t.id,
        name: t.name,
        division: t.division,
        rank: ++rankIn[t.division],
        score,
        solvedCount: t.solved.size,
      }));
      const out: Challenge[] = challenges.map((c) => ({
        ...c,
        solvedCount: teams.filter((t) => t.solved.has(c.id)).length,
      }));
      const solves = teams.flatMap((t) => [...t.solved.values()]);
      return { entries, challenges: out, solves };
    },
    onSolve(cb) {
      listeners.push(cb);
    },
  };
}

// Auto-event detection: per-division bloods, Takeover, The Wall Falls, On Fire, Milestone.
// Fed every new solve (in time order) and every scoreboard poll; queues events via `queue`.
import type { AutoConfig, AutoEventKind, Challenge, Division, Game, ScoreEntry, Solve, TemplateId } from '@iboh/shared';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { kv } from './db.js';

const DEFAULTS: AutoConfig = {
  bloods: true,
  takeover: { enabled: true, cooldownMin: 15 },
  wallFalls: { enabled: true, hours: 3 },
  onFire: { enabled: true, count: 3, windowMin: 10, cooldownMin: 30 },
  milestone: { enabled: true, list: [100, 250, 500, 750, 1000] },
  staleMin: 5,
};

const minutes = z.number().min(0).max(24 * 60);
export const AutoConfigSchema = z.object({
  bloods: z.boolean(),
  takeover: z.object({ enabled: z.boolean(), cooldownMin: minutes }),
  wallFalls: z.object({ enabled: z.boolean(), hours: z.number().min(0).max(48) }),
  onFire: z.object({ enabled: z.boolean(), count: z.number().int().min(2).max(50), windowMin: minutes, cooldownMin: minutes }),
  milestone: z.object({ enabled: z.boolean(), list: z.array(z.number().int().positive()).max(50) }),
  staleMin: minutes,
});

let config: AutoConfig = { ...DEFAULTS, ...kv.get<Partial<AutoConfig>>('autoConfig') };
export const autoConfig = () => config;
export function setAutoConfig(next: AutoConfig) {
  config = next;
  kv.set('autoConfig', config);
}

interface Leader {
  teamId: number;
  name: string;
  score: number;
}

type QueueFn = (template: TemplateId, input: Record<string, unknown>) => void;

const bloodKey = (s: Solve, rank: number) => `${s.challengeId}:${s.division}:${rank}`;

export function createDetectors({ queue, log, now = Date.now }: { queue: QueueFn; log: FastifyBaseLogger; now?: () => number }) {
  /** Every known solve, sorted by time. Bounded by teams × challenges. */
  let solves: Solve[] = [];
  let primed = false;
  const announced = new Set(kv.get<string[]>('bloods:announced') ?? []);
  const milestonesFired = new Set(kv.get<number[]>('milestones:fired') ?? []);
  const onFireLast: Record<number, number> = kv.get('onFire:last') ?? {};
  const takeover = kv.get<{ leaders: Partial<Record<Division, Leader>>; last: Partial<Record<Division, number>> }>('takeover') ?? { leaders: {}, last: {} };
  // When each challenge became available (game start, or when it first appeared if added later).
  let release = kv.get<Record<number, number>>('challenge:release') ?? null;
  /** Rehearsal: the next detection of these kinds skips its threshold/cooldown. */
  const forced = new Set<AutoEventKind>();

  const staleMs = () => config.staleMin * 60_000;
  const take = (kind: AutoEventKind) => forced.delete(kind);

  function bloodRank(solve: Solve): 1 | 2 | 3 | undefined {
    const i = solves.filter((s) => s.challengeId === solve.challengeId && s.division === solve.division).findIndex((s) => s.id === solve.id);
    return i >= 0 && i < 3 ? ((i + 1) as 1 | 2 | 3) : undefined;
  }

  function insert(solve: Solve) {
    let i = solves.length;
    while (i > 0 && solves[i - 1]!.time > solve.time) i--;
    solves.splice(i, 0, solve);
  }

  function bloodInput(s: Solve, rank: 1 | 2 | 3) {
    return { rank, division: s.division, team: s.teamName, player: s.player, challenge: s.challenge, category: s.category, time: s.time };
  }

  function save() {
    kv.set('bloods:announced', [...announced]);
    kv.set('milestones:fired', [...milestonesFired]);
    kv.set('onFire:last', onFireLast);
  }

  return {
    solves: () => solves,
    force: (kind: AutoEventKind) => forced.add(kind),

    /** First scoreboard after boot: rebuild state from history without re-announcing old news. */
    prime(history: Solve[]) {
      solves = [...history].sort((a, b) => a.time - b.time);
      for (const s of solves) {
        const rank = bloodRank(s);
        if (!rank || announced.has(bloodKey(s, rank))) continue;
        announced.add(bloodKey(s, rank));
        // A blood from the last few minutes (e.g. while we restarted) still gets its card.
        if (config.bloods && now() - s.time < staleMs()) queue('blood', bloodInput(s, rank));
      }
      for (const m of config.milestone.list) if (m <= solves.length) milestonesFired.add(m);
      primed = true;
      save();
    },

    /** Blood rank for display (feed highlight), from the full history. */
    bloodOf(solve: Solve) {
      return bloodRank(solve);
    },

    /** A new solve, live. Queues whatever it triggers; returns its blood rank for the feed. */
    onSolve(solve: Solve): 1 | 2 | 3 | undefined {
      if (!primed) return undefined; // prime() will see it in the history
      const firstEver = !solves.some((s) => s.challengeId === solve.challengeId);
      insert(solve);
      const rank = bloodRank(solve);
      const t = now();

      // The Wall Falls: first solve of a challenge that stood unsolved for hours. Replaces that 1st blood card.
      const stood = solve.time - (release?.[solve.challengeId] ?? solve.time);
      let wallFell = false;
      if (config.wallFalls.enabled && firstEver && (stood >= config.wallFalls.hours * 3_600_000 || take('wall-falls'))) {
        queue('wall-falls', { challenge: solve.challenge, category: solve.category, stoodMs: stood, team: solve.teamName, player: solve.player, division: solve.division, detectedAt: t });
        wallFell = true;
      }

      if (rank && !announced.has(bloodKey(solve, rank))) {
        announced.add(bloodKey(solve, rank));
        if (config.bloods && !(wallFell && rank === 1)) queue('blood', bloodInput(solve, rank));
      }

      // On Fire: a streak of solves by one team inside the window, at most once per cooldown.
      const of = config.onFire;
      const streak = solves.filter((s) => s.teamId === solve.teamId && s.time > solve.time - of.windowMin * 60_000 && s.time <= solve.time);
      if (of.enabled && streak.length >= of.count && (t - (onFireLast[solve.teamId] ?? 0) >= of.cooldownMin * 60_000 || take('on-fire'))) {
        onFireLast[solve.teamId] = t;
        queue('on-fire', { team: solve.teamName, division: solve.division, count: streak.length, challenges: streak.map((s) => s.challenge), detectedAt: t });
      }

      // Milestone: total correct solves across both divisions.
      const total = solves.length;
      const hit = config.milestone.list.includes(total) && !milestonesFired.has(total);
      if (config.milestone.enabled && (hit || take('milestone'))) {
        milestonesFired.add(total);
        queue('milestone', { milestone: total, team: solve.teamName, player: solve.player, division: solve.division, detectedAt: t });
      }

      save();
      return rank;
    },

    /** Every scoreboard poll: challenge release times and Takeover (a new #1 in a division). */
    onScoreboard(entries: ScoreEntry[], challenges: Challenge[], game: Game | null) {
      const t = now();
      // The very first board ever: everything on it was released at game start.
      const fresh = release === null;
      release ??= {};
      for (const c of challenges) release[c.id] ??= fresh && game ? game.start : t;
      kv.set('challenge:release', release);

      for (const division of ['Local', 'International'] as Division[]) {
        const top = entries.find((e) => e.division === division && e.rank === 1);
        if (!top) continue;
        const leader: Leader = { teamId: top.teamId, name: top.name, score: top.score };
        const prev = takeover.leaders[division];
        takeover.leaders[division] = leader;
        if (!prev || prev.teamId === leader.teamId || leader.score <= 0) continue;
        // Cooldown drops (not delays) swaps, which also stops two teams flip-flopping on screen.
        if (!config.takeover.enabled) continue;
        if (t - (takeover.last[division] ?? 0) < config.takeover.cooldownMin * 60_000 && !take('takeover')) {
          log.info({ division, leader: leader.name }, 'takeover dropped: cooldown');
          continue;
        }
        takeover.last[division] = t;
        const dethronedScore = entries.find((e) => e.teamId === prev.teamId)?.score ?? prev.score;
        queue('takeover', {
          division,
          leader: { name: leader.name, score: leader.score, teamId: leader.teamId },
          dethroned: { name: prev.name, score: dethronedScore },
          gap: leader.score - dethronedScore,
          detectedAt: t,
        });
      }
      kv.set('takeover', takeover);
    },
  };
}

export type Detectors = ReturnType<typeof createDetectors>;

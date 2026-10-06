// Template registry: one entry per event type. The queue engine only talks to this shape,
// so a new event type is a new entry here + a component in web/src/templates/.
import type { DisplayState, Division, Game, Phase, Priority, ScoreRow, Solve, TemplateId, TemplatePayloads, Top10Board } from '@iboh/shared';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { kv } from './db.js';
import { autoConfig } from './detectors.js';

export interface TemplateContext {
  game: Game | null;
  scoreboard: DisplayState['scoreboard'];
  phase: Phase;
  now: number;
  /** Every known solve, oldest first. */
  solves: Solve[];
}

interface TemplateDef<K extends TemplateId> {
  /** Validates admin-provided fields. */
  input: z.ZodTypeAny;
  priority: Priority;
  /** Null: plays until the display reports done. */
  durationMs: number | null | ((payload: TemplatePayloads[K]) => number | null);
  /** Build the payload from live data at play time. Null = skip silently (nothing to show). */
  resolve(input: any, ctx: TemplateContext): TemplatePayloads[K] | null;
}

export const VIDEO_DIR = fileURLToPath(new URL('../../data/media/videos/', import.meta.url));
mkdirSync(VIDEO_DIR, { recursive: true });
const VIDEO_FILE = /^[\w.-]+\.(mp4|webm)$/i;
let videoTurn = 0;

const DIVISIONS: Division[] = ['Local', 'International'];
const Div = z.enum(['Local', 'International']);
const name = z.string().max(200);

/** Auto-events carry when they were detected; too old by play time = skip rather than show stale news. */
const fresh = (input: { detectedAt: number }, ctx: TemplateContext) => ctx.now - input.detectedAt <= autoConfig().staleMin * 60_000;
type Detected<K extends TemplateId> = TemplatePayloads[K] & { detectedAt: number };
const withoutDetectedAt = <T extends { detectedAt: number }>({ detectedAt: _, ...rest }: T) => rest;

function top10Board(division: Division, ctx: TemplateContext): Top10Board | null {
  const all = ctx.scoreboard.entries.filter((e) => e.division === division);
  if (!all.length) return null;
  const toRow = ({ teamId, name, rank, score, solvedCount }: ScoreRow): ScoreRow => ({ teamId, name, rank, score, solvedCount });
  const rows = all.slice(0, 10).map(toRow);
  const ranks = Object.fromEntries(all.map((e) => [e.teamId, e.rank]));
  // Compare against what this division's board showed last time, not the last poll.
  const prev = kv.get<{ rows: ScoreRow[]; ranks: Record<number, number> }>(`top10:${division}`);
  kv.set(`top10:${division}`, { rows, ranks });
  return { division, rows, prevRows: prev?.rows ?? null, prevRanks: prev?.ranks ?? null };
}

export const templates: { [K in TemplateId]: TemplateDef<K> } = {
  'countdown-start': {
    input: z.object({}),
    priority: 'normal',
    durationMs: 15_000,
    resolve: (_, { game, now }) => (game && game.start > now ? { target: game.start, label: 'CTF starts in' } : null),
  },
  'countdown-end': {
    input: z.object({}),
    priority: 'normal',
    durationMs: 15_000,
    resolve: (_, { game, phase }) => (game && phase === 'live' ? { target: game.end, label: 'Time remaining' } : null),
  },
  announcement: {
    input: z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().max(400).default('') }),
    priority: 'high',
    durationMs: 12_000,
    resolve: (input: { title: string; body: string }) => input,
  },
  top10: {
    input: z.object({}),
    priority: 'normal',
    durationMs: (p) => 15_000 * p.boards.length,
    resolve: (_, ctx) => {
      const boards = DIVISIONS.map((d) => top10Board(d, ctx)).filter((b) => b !== null);
      return boards.length ? { boards } : null;
    },
  },
  unsolved: {
    input: z.object({}),
    priority: 'normal',
    durationMs: 15_000,
    resolve: (_, { scoreboard }) => {
      // Names and categories only: never descriptions or hints.
      const byCat = new Map<string, string[]>();
      for (const c of scoreboard.challenges) if (c.solvedCount === 0) byCat.set(c.category, [...(byCat.get(c.category) ?? []), c.title]);
      if (!byCat.size) return null;
      const categories = [...byCat].map(([category, challenges]) => ({ category, challenges }));
      return { categories, total: categories.reduce((n, c) => n + c.challenges.length, 0) };
    },
  },
  'sponsor-video': {
    input: z.object({ file: z.string().regex(VIDEO_FILE).optional() }),
    priority: 'normal',
    durationMs: null,
    resolve: (input: { file?: string }) => {
      if (input.file) return existsSync(VIDEO_DIR + input.file) ? { url: `/media/videos/${encodeURIComponent(input.file)}` } : null;
      // No file chosen (loop entry): rotate through every uploaded video.
      const files = readdirSync(VIDEO_DIR).filter((f) => VIDEO_FILE.test(f)).sort();
      if (!files.length) return null;
      return { url: `/media/videos/${encodeURIComponent(files[videoTurn++ % files.length]!)}` };
    },
  },
  blood: {
    input: z.object({ rank: z.union([z.literal(1), z.literal(2), z.literal(3)]), division: Div, team: name, player: name, challenge: name, category: name, time: z.number() }),
    priority: 'high',
    durationMs: 8_000,
    // Every blood plays, even late in an opening rush: no staleness check.
    resolve: (input: TemplatePayloads['blood']) => input,
  },
  takeover: {
    input: z.object({
      division: Div,
      leader: z.object({ name, score: z.number(), teamId: z.number() }),
      dethroned: z.object({ name, score: z.number() }),
      gap: z.number(),
      detectedAt: z.number(),
    }),
    priority: 'high',
    durationMs: 10_000,
    resolve: (input, ctx) => {
      // Still true? The new leader must hold #1 right now.
      const top = ctx.scoreboard.entries.find((e) => e.division === input.division && e.rank === 1);
      if (!fresh(input, ctx) || !top || top.teamId !== input.leader.teamId) return null;
      const dethroned = ctx.scoreboard.entries.find((e) => e.division === input.division && e.name === input.dethroned.name);
      const dScore = dethroned?.score ?? input.dethroned.score;
      return { division: input.division, leader: { name: top.name, score: top.score }, dethroned: { name: input.dethroned.name, score: dScore }, gap: top.score - dScore };
    },
  },
  'wall-falls': {
    input: z.object({ challenge: name, category: name, stoodMs: z.number(), team: name, player: name, division: Div, detectedAt: z.number() }),
    priority: 'high',
    durationMs: 10_000,
    resolve: (input: Detected<'wall-falls'>, ctx) => (fresh(input, ctx) ? withoutDetectedAt(input) : null),
  },
  'on-fire': {
    input: z.object({ team: name, division: Div, count: z.number().int(), challenges: z.array(name).max(50), detectedAt: z.number() }),
    priority: 'normal',
    durationMs: 8_000,
    resolve: (input: Detected<'on-fire'>, ctx) => (fresh(input, ctx) ? withoutDetectedAt(input) : null),
  },
  milestone: {
    input: z.object({ milestone: z.number().int(), team: name, player: name, division: Div, detectedAt: z.number() }),
    priority: 'normal',
    durationMs: 8_000,
    resolve: (input: Detected<'milestone'>, ctx) => (fresh(input, ctx) ? withoutDetectedAt(input) : null),
  },
  spotlight: {
    input: z.object({}),
    priority: 'normal',
    durationMs: 12_000,
    resolve: (_, ctx) => spotlight(ctx),
  },
};

export const templateIds = Object.keys(templates) as TemplateId[];

function spotlight(ctx: TemplateContext): TemplatePayloads['spotlight'] | null {
  const recent = kv.get<number[]>('spotlight:recent') ?? [];
  const eligible = ctx.scoreboard.entries.filter((e) => e.solvedCount > 0 && !recent.includes(e.teamId));
  // Prefer teams that the top 10 boards never show.
  const pool = eligible.some((e) => e.rank > 10) ? eligible.filter((e) => e.rank > 10) : eligible;
  const team = pool[Math.floor(Math.random() * pool.length)];
  if (!team) return null;
  kv.set('spotlight:recent', [team.teamId, ...recent].slice(0, 10));
  const own = ctx.solves.filter((s) => s.teamId === team.teamId);
  const perCat = new Map<string, number>();
  for (const s of own) perCat.set(s.category, (perCat.get(s.category) ?? 0) + 1);
  const topCategory = [...perCat].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const players = [...new Set(own.map((s) => s.player).filter(Boolean))];
  return { name: team.name, division: team.division, rank: team.rank, score: team.score, solvedCount: team.solvedCount, topCategory, players };
}

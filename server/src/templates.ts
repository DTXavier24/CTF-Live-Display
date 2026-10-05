// Template registry: one entry per event type. The queue engine only talks to this shape,
// so a new event type is a new entry here + a component in web/src/templates/.
import type { DisplayState, Division, Game, Phase, Priority, ScoreRow, TemplateId, TemplatePayloads, Top10Board } from '@iboh/shared';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { kv } from './db.js';

export interface TemplateContext {
  game: Game | null;
  scoreboard: DisplayState['scoreboard'];
  phase: Phase;
  now: number;
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
};

export const templateIds = Object.keys(templates) as TemplateId[];

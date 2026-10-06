// Types only: shared by server and web. Normalized domain shapes, never raw GZCTF responses.

export type Division = 'Local' | 'International';
export type Phase = 'pre' | 'live' | 'ended';

/** All times are epoch milliseconds. */
export interface Game {
  title: string;
  start: number;
  end: number;
}

export interface Challenge {
  id: number;
  title: string;
  category: string;
  points: number;
  solvedCount: number;
}

export interface ScoreEntry {
  teamId: number;
  name: string;
  division: Division;
  /** Rank within its division. */
  rank: number;
  score: number;
  solvedCount: number;
}

export interface Scoreboard {
  entries: ScoreEntry[];
  challenges: Challenge[];
  /** Full solve history. Server-only: stripped before broadcasting. */
  solves: Solve[];
}

export interface Solve {
  /** `${teamId}-${challengeId}`: the same solve from the hub and the scoreboard dedupes. */
  id: string;
  teamId: number;
  teamName: string;
  division: Division;
  player: string;
  challengeId: number;
  challenge: string;
  category: string;
  time: number;
  /** Per-division blood rank, filled in by the blood detector (phase 4). */
  blood?: 1 | 2 | 3;
}

export type PerDivision<T> = Record<Division, T>;

export interface Stats {
  teams: PerDivision<number>;
  solves: PerDivision<number>;
  /** Rolling 5-minute window. */
  flagsPerMin: PerDivision<number>;
}

export interface DisplayState {
  phase: Phase;
  game: Game | null;
  scoreboard: Omit<Scoreboard, 'solves'>;
  /** Latest solves, newest first, capped at 8. */
  solves: Solve[];
  stats: Stats;
  /** GZCTF unreachable: showing last-known data. */
  dataDelayed: boolean;
  serverTime: number;
  mock: boolean;
  /** Current featured item (center panel, or full screen for takeovers). */
  now: NowPlaying | null;
}

export interface ServerToClientEvents {
  state: (state: DisplayState) => void;
}

// ---------- Queue / loop / templates ----------

export type Priority = 'normal' | 'high';

export interface ScoreRow {
  teamId: number;
  name: string;
  rank: number;
  score: number;
  solvedCount: number;
}

export interface Top10Board {
  division: Division;
  rows: ScoreRow[];
  /** The board as last shown for this division, so rows can animate from there. */
  prevRows: ScoreRow[] | null;
  /** Previous rank of every team (not just the top 10), for ▲/▼ movement. */
  prevRanks: Record<number, number> | null;
}

/** Display payload per template, built by the server at play time. */
export interface TemplatePayloads {
  'countdown-start': { target: number; label: string };
  'countdown-end': { target: number; label: string };
  announcement: { title: string; body: string };
  top10: { boards: Top10Board[] };
  unsolved: { categories: { category: string; challenges: string[] }[]; total: number };
  'sponsor-video': { url: string };
}
export type TemplateId = keyof TemplatePayloads;

export type NowPlaying = {
  [K in TemplateId]: {
    /** Unique per play, so the same loop entry twice still gets a fresh transition. */
    id: string;
    template: K;
    payload: TemplatePayloads[K];
    /** Null: plays until the display reports done (videos). */
    durationMs: number | null;
    status: 'loading' | 'playing';
    startedAt: number | null;
    source: 'queue' | 'loop';
  };
}[TemplateId];

export interface QueueItem {
  id: string;
  template: TemplateId;
  /** Admin-provided fields, validated by the template's schema. */
  input: unknown;
  priority: Priority;
  durationMs?: number;
  createdAt: number;
}

export interface LoopEntry {
  template: TemplateId;
  input?: unknown;
  durationMs?: number;
}

export interface LoopConfig {
  enabled: boolean;
  entries: LoopEntry[];
}

export type ReportStatus = 'ready' | 'done' | 'error';

export interface ClientToServerEvents {
  report: (r: { id: string; status: ReportStatus; error?: string }) => void;
  /** Hidden tabs don't animate, so they can't play items: only visible displays count as watching. */
  visibility: (visible: boolean) => void;
}

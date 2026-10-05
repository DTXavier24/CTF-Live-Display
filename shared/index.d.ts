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
  /** Latest solves, newest first, capped at 10. */
  solves: Solve[];
  stats: Stats;
  /** GZCTF unreachable: showing last-known data. */
  dataDelayed: boolean;
  serverTime: number;
  mock: boolean;
}

export interface ServerToClientEvents {
  state: (state: DisplayState) => void;
}

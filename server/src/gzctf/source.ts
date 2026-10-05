import type { Game, Scoreboard, Solve } from '@iboh/shared';

/** The only surface the app sees. Real and mock clients both adapt GZCTF into these shapes. */
export interface GzctfSource {
  getGame(): Promise<Game>;
  getScoreboard(): Promise<Scoreboard>;
  onSolve(cb: (solve: Solve) => void): void;
}

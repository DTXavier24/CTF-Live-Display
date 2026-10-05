// Raw GZCTF shapes (verified against the dimasma0305/GZCTF fork source + upstream OpenAPI)
// and their mapping into domain types. Nothing outside server/src/gzctf/ sees raw shapes.
import type { Challenge, Division, Game, ScoreEntry, Scoreboard, Solve } from '@iboh/shared';
import { z } from 'zod';

// DateTimeOffset is serialized as Unix milliseconds.
const ms = z.number();

export const RawGame = z.object({ title: z.string(), start: ms, end: ms });

const RawChallengeInfo = z.object({
  id: z.number(),
  title: z.string(),
  category: z.string(),
  score: z.number(),
  solved: z.number(),
});

const RawScoreboardItem = z.object({
  id: z.number(),
  name: z.string(),
  divisionId: z.number().nullish(),
  score: z.number(),
  rank: z.number(),
  solvedChallenges: z.array(
    z.object({ id: z.number(), userName: z.string().nullish(), time: ms }),
  ),
});

export const RawScoreboard = z.object({
  items: z.array(RawScoreboardItem),
  divisions: z.array(z.object({ id: z.number(), name: z.string() })),
  challenges: z.record(z.array(RawChallengeInfo)),
});
export type RawScoreboard = z.infer<typeof RawScoreboard>;

/** Hub `ReceivedSubmissions` payload: names only, no ids. */
export const RawSubmission = z.object({
  status: z.string(),
  time: ms,
  user: z.string(),
  team: z.string(),
  challenge: z.string(),
});

/** GZCTF division names are free text; the event names them Local and International. */
export function toDivision(name: string): Division | null {
  if (/international|intl/i.test(name)) return 'International';
  if (/local/i.test(name)) return 'Local';
  return null;
}

export function adaptGame(raw: z.infer<typeof RawGame>): Game {
  return { title: raw.title, start: raw.start, end: raw.end };
}

export function adaptScoreboard(raw: RawScoreboard, warn: (msg: string) => void = () => {}): Scoreboard {
  const divisionOf = new Map(raw.divisions.map((d) => [d.id, toDivision(d.name)]));
  for (const d of raw.divisions) if (!divisionOf.get(d.id)) warn(`GZCTF division "${d.name}" is neither Local nor International; its teams are hidden`);

  const challenges: Challenge[] = Object.values(raw.challenges).flat().map((c) => ({
    id: c.id,
    title: c.title,
    category: c.category,
    points: c.score,
    solvedCount: c.solved,
  }));
  const chalById = new Map(challenges.map((c) => [c.id, c]));

  const rankIn: Record<Division, number> = { Local: 0, International: 0 };
  const entries: ScoreEntry[] = [];
  const solves: Solve[] = [];
  for (const item of [...raw.items].sort((a, b) => a.rank - b.rank)) {
    const division = item.divisionId == null ? null : divisionOf.get(item.divisionId);
    if (!division) continue;
    entries.push({
      teamId: item.id,
      name: item.name,
      division,
      rank: ++rankIn[division],
      score: item.score,
      solvedCount: item.solvedChallenges.length,
    });
    for (const s of item.solvedChallenges) {
      const chal = chalById.get(s.id);
      if (!chal) continue;
      solves.push({
        id: `${item.id}-${s.id}`,
        teamId: item.id,
        teamName: item.name,
        division,
        player: s.userName ?? '',
        challengeId: s.id,
        challenge: chal.title,
        category: chal.category,
        time: s.time,
      });
    }
  }
  return { entries, challenges, solves };
}

/** Map a hub submission to a Solve using the last scoreboard. Null if not accepted or not resolvable yet. */
export function adaptSubmission(raw: z.infer<typeof RawSubmission>, board: Scoreboard): Solve | null {
  if (raw.status !== 'Accepted') return null;
  const team = board.entries.find((e) => e.name === raw.team);
  const chal = board.challenges.find((c) => c.title === raw.challenge);
  // Unknown team/challenge (e.g. joined since the last poll): the next scoreboard diff picks it up.
  if (!team || !chal) return null;
  return {
    id: `${team.teamId}-${chal.id}`,
    teamId: team.teamId,
    teamName: team.name,
    division: team.division,
    player: raw.user,
    challengeId: chal.id,
    challenge: chal.title,
    category: chal.category,
    time: raw.time,
  };
}

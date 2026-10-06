import type { Division, ScoreEntry, Solve } from '@iboh/shared';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.DB_FILE = ':memory:';
const { createDetectors, setAutoConfig } = await import('./detectors.js');
const { kv } = await import('./db.js');

const MIN = 60_000;
const log = { info() {}, warn() {}, error() {} } as never;
let clock = 1_000_000_000_000;
const now = () => clock;
let queued: { template: string; input: any }[] = [];
const queue = (template: string, input: any) => queued.push({ template, input });

const TEAMS: Record<string, Division> = { A: 'Local', B: 'International', C: 'Local', D: 'Local', E: 'Local', F: 'International' };
const solve = (team: string, chal: number, time = clock): Solve => ({
  id: `${team}-${chal}`, teamId: team.charCodeAt(0), teamName: team, division: TEAMS[team]!, player: `${team}-player`,
  challengeId: chal, challenge: `Chal ${chal}`, category: 'Web', time,
});
const entry = (team: string, rank: number, score: number): ScoreEntry => ({
  teamId: team.charCodeAt(0), name: team, division: TEAMS[team]!, rank, score, solvedCount: 1,
});
const fresh = () => createDetectors({ queue: queue as never, log, now });

beforeEach(() => {
  queued = [];
  clock = 1_000_000_000_000;
  for (const k of ['bloods:announced', 'milestones:fired', 'onFire:last', 'takeover', 'challenge:release']) kv.set(k, null);
  setAutoConfig({
    bloods: true,
    takeover: { enabled: true, cooldownMin: 15 },
    wallFalls: { enabled: true, hours: 3 },
    onFire: { enabled: true, count: 3, windowMin: 10, cooldownMin: 30 },
    milestone: { enabled: true, list: [5] },
    staleMin: 5,
    durations: { blood: 8, takeover: 10, 'wall-falls': 10, 'on-fire': 8, milestone: 8 },
  });
});

test('bloods are per division: first three solvers within each division', () => {
  const d = fresh();
  d.prime([]);
  const ranks = ['A', 'B', 'C', 'D', 'E'].map((t, i) => d.onSolve(solve(t, 1, clock + i)));
  assert.deepEqual(ranks, [1, 1, 2, 3, undefined]);
  assert.deepEqual(queued.filter((q) => q.template === 'blood').map((q) => `${q.input.team}:${q.input.division}:${q.input.rank}`), [
    'A:Local:1', 'B:International:1', 'C:Local:2', 'D:Local:3',
  ]);
});

test('restart: old bloods are not re-announced, recent ones still are, ranks continue', () => {
  const d1 = fresh();
  d1.prime([]);
  d1.onSolve(solve('A', 1));
  queued = [];
  // Restart 1 hour later. History has A (announced before) plus C, a blood that happened while down, long ago.
  clock += 60 * MIN;
  const d2 = fresh();
  d2.prime([solve('A', 1, clock - 60 * MIN), solve('C', 1, clock - 30 * MIN), solve('B', 1, clock - 1 * MIN)]);
  // C is stale (30 min): marked, not queued. B (1 min ago) still gets its card.
  assert.deepEqual(queued.map((q) => `${q.input.team}:${q.input.rank}`), ['B:1']);
  assert.equal(d2.onSolve(solve('D', 1)), 3);
  // Same instance restarting again: nothing re-announced.
  queued = [];
  fresh().prime([solve('A', 1, clock - 60 * MIN), solve('C', 1, clock - 30 * MIN), solve('B', 1, clock - 1 * MIN), solve('D', 1)]);
  assert.equal(queued.length, 0);
});

test('the wall falls replaces the solver division 1st blood only', () => {
  const d = fresh();
  d.onScoreboard([], [{ id: 1, title: 'Chal 1', category: 'Web', points: 500, solvedCount: 0 }], { title: 'g', start: clock, end: clock + 600 * MIN });
  d.prime([]);
  clock += 4 * 60 * MIN;
  d.onSolve(solve('A', 1));
  d.onSolve(solve('B', 1, clock + 1));
  assert.deepEqual(queued.map((q) => q.template), ['wall-falls', 'blood']);
  assert.equal(queued[0]!.input.stoodMs, 4 * 60 * MIN);
  assert.equal(queued[1]!.input.division, 'International');
});

test('no wall falls before the threshold', () => {
  const d = fresh();
  d.onScoreboard([], [{ id: 1, title: 'Chal 1', category: 'Web', points: 500, solvedCount: 0 }], { title: 'g', start: clock, end: clock + 600 * MIN });
  d.prime([]);
  clock += 2 * 60 * MIN;
  d.onSolve(solve('A', 1));
  assert.deepEqual(queued.map((q) => q.template), ['blood']);
});

test('takeover respects its cooldown under flip-flopping', () => {
  const d = fresh();
  const board = (first: string, second: string) => [entry(first, 1, 200), entry(second, 2, 100)];
  d.onScoreboard(board('A', 'C'), [], null); // first sight: just records the leader
  d.onScoreboard(board('C', 'A'), [], null); // swap -> fires
  clock += 1 * MIN;
  d.onScoreboard(board('A', 'C'), [], null); // swap back within cooldown -> dropped
  clock += 1 * MIN;
  d.onScoreboard(board('C', 'A'), [], null); // and again -> dropped
  clock += 15 * MIN;
  d.onScoreboard(board('A', 'C'), [], null); // after cooldown -> fires
  assert.deepEqual(queued.map((q) => `${q.input.leader.name}>${q.input.dethroned.name}`), ['C>A', 'A>C']);
});

test('on fire: 3 solves in 10 minutes, then cooldown', () => {
  const d = fresh();
  d.prime([]);
  for (const c of [1, 2, 3]) {
    clock += 2 * MIN;
    d.onSolve(solve('A', c));
  }
  clock += 2 * MIN;
  d.onSolve(solve('A', 4)); // still on fire, but within the 30 min cooldown
  const fires = queued.filter((q) => q.template === 'on-fire');
  assert.equal(fires.length, 1);
  assert.deepEqual(fires[0]!.input.challenges, ['Chal 1', 'Chal 2', 'Chal 3']);
});

test('milestone fires once at the exact count; force skips thresholds once', () => {
  const d = fresh();
  d.prime([1, 2, 3, 4].map((c) => solve('F', c, clock - 60 * MIN)));
  d.onSolve(solve('A', 9));
  assert.deepEqual(queued.filter((q) => q.template === 'milestone').map((q) => q.input.milestone), [5]);
  d.force('milestone');
  d.onSolve(solve('C', 9));
  d.onSolve(solve('D', 9));
  assert.deepEqual(queued.filter((q) => q.template === 'milestone').map((q) => q.input.milestone), [5, 6]);
});

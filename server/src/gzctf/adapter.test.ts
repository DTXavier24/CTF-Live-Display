import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adaptScoreboard, adaptSubmission, RawScoreboard, toDivision } from './adapter.js';

// Shape of GET /api/game/{id}/scoreboard per the fork's ScoreboardModel JSON names.
const raw = RawScoreboard.parse({
  updateTimeUtc: 1791214543258,
  bloodBonus: 52459530,
  timelines: [],
  freeze: null,
  isFrozenView: false,
  challengeCount: 2,
  divisions: [
    { id: 1, name: 'Local', defaultPermissions: 2147483647, challengeConfigs: {} },
    { id: 2, name: 'International', defaultPermissions: 2147483647, challengeConfigs: {} },
    { id: 3, name: 'Staff', defaultPermissions: 2147483647, challengeConfigs: {} },
  ],
  challenges: {
    Web: [{ id: 10, title: 'Cookie', category: 'Web', type: 'StaticAttachment', score: 500, solved: 2, bloods: [], disableBloodBonus: false }],
    Pwn: [{ id: 11, title: 'Smash', category: 'Pwn', type: 'StaticAttachment', score: 300, solved: 1, bloods: [], disableBloodBonus: false }],
  },
  items: [
    { id: 7, name: 'Intl A', divisionId: 2, score: 800, rank: 1, divisionRank: 1, lastSubmissionTime: 3, solvedCount: 2,
      solvedChallenges: [{ id: 10, score: 500, type: 'FirstBlood', userName: 'alice', time: 1 }, { id: 11, score: 300, type: 'FirstBlood', userName: null, time: 3 }] },
    { id: 9, name: 'Staff Team', divisionId: 3, score: 600, rank: 2, solvedChallenges: [], solvedCount: 0, lastSubmissionTime: 0 },
    { id: 8, name: 'Local B', divisionId: 1, score: 500, rank: 3, divisionRank: 1, lastSubmissionTime: 2, solvedCount: 1,
      solvedChallenges: [{ id: 10, score: 500, type: 'Normal', userName: 'bob', time: 2 }] },
    { id: 5, name: 'No Division', divisionId: null, score: 0, rank: 4, solvedChallenges: [], solvedCount: 0, lastSubmissionTime: 0 },
  ],
});

test('toDivision', () => {
  assert.equal(toDivision('Local'), 'Local');
  assert.equal(toDivision('International Teams'), 'International');
  assert.equal(toDivision('Staff'), null);
});

test('adaptScoreboard maps divisions, ranks per division, hides unmapped teams', () => {
  const warnings: string[] = [];
  const board = adaptScoreboard(raw, (m) => warnings.push(m));
  assert.deepEqual(
    board.entries.map((e) => [e.name, e.division, e.rank, e.solvedCount]),
    [['Intl A', 'International', 1, 2], ['Local B', 'Local', 1, 1]],
  );
  assert.equal(warnings.length, 1);
  assert.deepEqual(board.challenges.map((c) => [c.id, c.points, c.solvedCount]), [[10, 500, 2], [11, 300, 1]]);
  assert.deepEqual(board.solves.map((s) => [s.id, s.player, s.challenge, s.division]), [
    ['7-10', 'alice', 'Cookie', 'International'],
    ['7-11', '', 'Smash', 'International'],
    ['8-10', 'bob', 'Cookie', 'Local'],
  ]);
});

test('adaptSubmission resolves names via the scoreboard, same id as the scoreboard solve', () => {
  const board = adaptScoreboard(raw);
  const sub = { status: 'Accepted', time: 5, user: 'carol', team: 'Local B', challenge: 'Smash', answer: 'flag{x}' };
  assert.equal(adaptSubmission(sub, board)?.id, '8-11');
  assert.equal(adaptSubmission({ ...sub, status: 'WrongAnswer' }, board), null);
  assert.equal(adaptSubmission({ ...sub, team: 'Unknown' }, board), null);
});

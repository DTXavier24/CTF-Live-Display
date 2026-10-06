import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DB_FILE = ':memory:';
const { modeAt, saveSettings } = await import('./state.js');

const MIN = 60_000;
const end = 1_000_000_000_000;
const game = { title: 'g', start: end - 600 * MIN, end };
const at = (msBeforeEnd: number) => modeAt(game, end - msBeforeEnd);
const stretch = { finalHour: 'auto' as const, finalHourMin: 60, finalCountdown: true, endedTop10: true };

test('final hour: auto turns on at the configured minutes before the end', () => {
  saveSettings({ phaseOverride: 'auto', finalStretch: stretch });
  assert.equal(at(61 * MIN).finalHour, false);
  assert.equal(at(60 * MIN).finalHour, true);
  assert.equal(at(1000).finalHour, true);
  saveSettings({ finalStretch: { ...stretch, finalHourMin: 30 } });
  assert.equal(at(45 * MIN).finalHour, false);
});

test('final hour: manual on/off win over the clock; never outside the live phase', () => {
  saveSettings({ phaseOverride: 'auto', finalStretch: { ...stretch, finalHour: 'on' } });
  assert.equal(at(300 * MIN).finalHour, true);
  saveSettings({ finalStretch: { ...stretch, finalHour: 'off' } });
  assert.equal(at(5 * MIN).finalHour, false);
  saveSettings({ finalStretch: stretch });
  assert.equal(at(-1000).finalHour, false); // ended
});

test('countdown: exactly the last 10 seconds, only on the real clock, only when enabled', () => {
  saveSettings({ phaseOverride: 'auto', finalStretch: stretch });
  assert.equal(at(10_001).countdown, false);
  assert.equal(at(10_000).countdown, true);
  assert.equal(at(1).countdown, true);
  assert.equal(at(0).countdown, false);
  assert.equal(at(0).phase, 'ended');
  saveSettings({ phaseOverride: 'live' });
  assert.equal(at(5000).countdown, false);
  saveSettings({ phaseOverride: 'auto', finalStretch: { ...stretch, finalCountdown: false } });
  assert.equal(at(5000).countdown, false);
});

test('an extended end time cancels the countdown', () => {
  saveSettings({ phaseOverride: 'auto', finalStretch: stretch });
  const now = end - 5000;
  assert.equal(modeAt(game, now).countdown, true);
  assert.equal(modeAt({ ...game, end: end + 5 * MIN }, now).countdown, false);
});

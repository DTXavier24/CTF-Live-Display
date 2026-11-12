// The edges of the game: the 10-second countdowns (into the start and into the end), final hour
// mode, and the final standings.
import type { DisplayState, Division, ScoreEntry } from '@iboh/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { fmtClock, serverNow } from '../server';

const EASE = [0.16, 1, 0.3, 1] as const;
const COUNTDOWN_MS = 10_000;
/** The "0" holds this long past the target, landing under the white burn, before the overlay leaves. */
const ZERO_HOLD_MS = 700;

/**
 * True from the exact target time (start or end), timed in the browser against the server clock.
 * The server's own phase push can trail by a poll tick; a countdown has to land on 0 exactly.
 */
export function usePast(target: number | undefined, enabled: boolean) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    setPast(false);
    if (!enabled || !target) return;
    const left = target - serverNow();
    if (left <= 0) return setPast(true);
    const t = setTimeout(() => setPast(true), left);
    return () => clearTimeout(t);
  }, [target, enabled]);
  return past;
}

const TONES = {
  red: { plate: 'plate-red', ring: 'border-red', zero: 'text-red', stripes: 'text-red' },
  cyan: { plate: 'plate-cyan', ring: 'border-cyan', zero: 'text-cyan', stripes: 'text-cyan' },
} as const;

/**
 * Full-screen 10 → 0 to `target`. Stays mounted; shows itself only in the last 10 seconds, so a
 * target that moves (an extension, a delayed start) cancels it cleanly.
 */
export function BigCountdown({ target, label, tone }: { target: number; label: string; tone: keyof typeof TONES }) {
  const end = target;
  const t = TONES[tone];
  const [left, setLeft] = useState(() => end - serverNow());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setLeft(end - serverNow());
    const start = () => {
      tick();
      interval = setInterval(tick, 50);
    };
    // Recompute right away: when the end time moves (an extension), the old "seconds left" must
    // not stay frozen on screen while we wait for the new last-10-seconds window.
    tick();
    const wait = end - COUNTDOWN_MS - serverNow();
    const begin = setTimeout(start, Math.max(0, wait));
    // Stop ticking once the zero has had its moment.
    const stop = setTimeout(() => clearInterval(interval), Math.max(0, end + ZERO_HOLD_MS + 500 - serverNow()));
    return () => {
      clearTimeout(begin);
      clearTimeout(stop);
      clearInterval(interval);
    };
  }, [end]);

  const active = left > -ZERO_HOLD_MS && left <= COUNTDOWN_MS;
  const n = Math.max(0, Math.ceil(left / 1000));
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="countdown"
          className="final-countdown absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-bg"
          initial={{ clipPath: 'inset(50% 0 50% 0)' }}
          animate={{ clipPath: 'inset(0% 0 0% 0)' }}
          // The hit at zero: the number blows past the camera as the screen burns out to white.
          exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeIn' } }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className={`stripes ${t.stripes}`} />
          <span className={`plate ${t.plate} relative text-6xl`}>{label}</span>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={n}
              className={`glitch relative font-display leading-none font-bold tabular-nums ${n === 0 ? t.zero : 'text-fg'}`}
              style={{ fontSize: 560 }}
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0, transition: { duration: 0.25 } }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              {n}
            </motion.span>
          </AnimatePresence>
          {/* A ring leaves the number on every second. */}
          <motion.span
            key={`ring-${n}`}
            aria-hidden
            className={`absolute h-[620px] w-[620px] rounded-full border-[6px] ${t.ring}`}
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 0.95, ease: EASE }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** One white burn when the game ends, over the cut into the closing statement. Plays once. */
export function EndFlash() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-50 bg-fg"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.92, 0] }}
      transition={{ duration: 1.6, times: [0, 0.38, 1], ease: 'easeOut' }}
    />
  );
}

/** Full-screen "FINAL HOUR" when the mode switches on mid-show (not when the page loads into it). */
export function FinalHourIntro({ on, end }: { on: boolean; end: number | undefined }) {
  const prev = useRef(on);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (on && !prev.current) {
      setShow(true);
      const t = setTimeout(() => setShow(false), 3600);
      prev.current = on;
      // If the mode flips again mid-intro, end the intro rather than leave it up for good.
      return () => {
        clearTimeout(t);
        setShow(false);
      };
    }
    prev.current = on;
  }, [on]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="final-hour"
          className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-bg"
          initial={{ clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          exit={{ clipPath: 'inset(0 0 0 100%)', transition: { duration: 0.5, ease: [0.76, 0, 0.24, 1] } }}
          transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="stripes text-red" />
          <span className="extend relative" style={{ animationDelay: '0.45s' }}>
            <span className="plate plate-red text-5xl">{end ? `Ends at ${fmtClock(end).slice(0, 5)} GMT+8` : 'IBOH 2026'}</span>
          </span>
          <p className="glitch hit relative font-display text-[260px] leading-none font-bold uppercase" style={{ animationDelay: '0.6s' }}>
            Final hour
          </p>
          {/* "I'm fine": the mascot after nine hours of hacking. */}
          <motion.img
            src="/brand/mascot/tired.png"
            alt=""
            className="absolute right-16 bottom-10 h-[360px]"
            initial={{ y: 420, rotate: 6 }}
            animate={{ y: 0, rotate: 0 }}
            transition={{ delay: 1.1, type: 'spring', stiffness: 110, damping: 15 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const DIVISIONS: Division[] = ['Local', 'International'];
const topOf = (entries: ScoreEntry[], division: Division, n: number) => entries.filter((e) => e.division === division && e.rank <= n).sort((a, b) => a.rank - b.rank);

/** Final hour replaces live stats: the top 3 of each division, Local above International. */
export function Top3Panel({ state }: { state: DisplayState }) {
  return (
    <div className="flex h-full flex-col justify-between gap-6">
      {DIVISIONS.map((d) => (
        <div key={d}>
          <span className={`plate mb-3 text-2xl ${d === 'Local' ? 'plate-cyan' : 'plate-dark shadow-[inset_0_0_0_2px_var(--color-cyan)]'}`}>{d}</span>
          <ol className="flex flex-col gap-2">
            {topOf(state.scoreboard.entries, d, 3).map((e) => (
              <motion.li
                key={e.teamId}
                layout
                transition={{ layout: { type: 'spring', stiffness: 140, damping: 18 } }}
                className={`flex h-[84px] items-center gap-3 pr-3 ${e.rank === 1 ? 'bg-cyan text-bg' : 'bg-bg/70'}`}
              >
                <span className={`flex h-full w-12 items-center justify-center font-display text-4xl font-bold ${e.rank === 1 ? '' : 'text-cyan'}`}>{e.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-2xl leading-tight font-bold">{e.name}</span>
                  <span className={`font-display text-xl tabular-nums ${e.rank === 1 ? 'text-bg/75' : 'text-fg-muted'}`}>{e.score} pts</span>
                </span>
              </motion.li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** Ended page: the final Top 10 of each division, alternating. */
export function FinalStandings({ entries }: { entries: ScoreEntry[] }) {
  const boards = DIVISIONS.filter((d) => topOf(entries, d, 10).length > 0);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (boards.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % boards.length), 10_000);
    return () => clearInterval(id);
  }, [boards.length]);
  const division = boards[i % Math.max(1, boards.length)];
  if (!division) return null;
  const rows = topOf(entries, division, 10);
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={division}
        className="w-[1400px]"
        initial={{ clipPath: 'inset(0 100% 0 0)' }}
        animate={{ clipPath: 'inset(0 0% 0 0)' }}
        exit={{ clipPath: 'inset(0 0 0 100%)' }}
        transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
      >
        <div className="mb-3 flex items-center gap-4">
          <span className="plate plate-cyan text-3xl">Final standings</span>
          <span className="font-display text-4xl font-bold uppercase">{division}</span>
        </div>
        <ol className="grid grid-flow-col grid-cols-2 grid-rows-5 gap-x-6 gap-y-1.5">
          {rows.map((e) => (
            <li key={e.teamId} className={`flex h-[52px] items-center gap-4 pr-4 ${e.rank === 1 ? 'bg-cyan text-bg' : 'bg-bg-2/90'}`}>
              <span className={`flex h-full w-14 items-center justify-center font-display text-3xl font-bold ${e.rank === 1 ? '' : 'text-cyan'}`}>{e.rank}</span>
              <span className="min-w-0 flex-1 truncate font-display text-2xl font-semibold">{e.name}</span>
              <span className="font-display text-2xl tabular-nums">{e.score}</span>
            </li>
          ))}
        </ol>
      </motion.div>
    </AnimatePresence>
  );
}

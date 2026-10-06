import type { DisplayState, Division, PerDivision, Solve } from '@iboh/shared';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Boundary } from '../Boundary';
import { CountUp, Mono } from '../CountUp';
import { ordinal } from '../templates/events';
import { Featured, isFullscreen } from './Featured';
import { Stage } from '../Stage';
import { fmtClock, fmtDuration, useNow, useServerState } from '../server';

// ponytail: hardcoded until the admin venue field (phase 5).
const VENUE = 'the main hall';

export function Display() {
  const { state, connected } = useServerState();
  const delayed = !state || !connected || state.dataDelayed;
  return (
    <Stage>
      <AnimatePresence mode="wait">
        <motion.div
          key={state?.phase ?? 'boot'}
          className="absolute inset-0"
          initial={{ clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
        >
          {!state ? (
            <Splash />
          ) : state.phase === 'pre' ? (
            <PreView state={state} />
          ) : state.phase === 'live' ? (
            <LiveView state={state} delayed={delayed} />
          ) : (
            <EndedView />
          )}
        </motion.div>
      </AnimatePresence>
      {state && <Overlay state={state} />}
      {state && delayed && <DelayedBadge />}
    </Stage>
  );
}

/** Full-screen takeovers, and queue items over the pre-CTF page (which has no center panel). */
function Overlay({ state }: { state: DisplayState }) {
  const now = state.now;
  const show = !!now && state.phase !== 'ended' && (isFullscreen(now) || state.phase === 'pre');
  if (!show) return null;
  return isFullscreen(now) ? (
    <div className="absolute inset-0 z-20 bg-bg">
      <Featured now={now} />
    </div>
  ) : (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/80">
      <div className="hud relative h-[760px] w-[1280px] overflow-hidden border border-line bg-bg-2 p-10">
        <div className="relative h-full">
          <Featured now={now} />
        </div>
      </div>
    </div>
  );
}

function Splash() {
  return (
    <div className="flex h-full items-center justify-center">
      <img src="/brand/logo_with_text.png" alt="" className="max-h-[360px]" />
    </div>
  );
}

function DelayedBadge() {
  return (
    <div className="eyebrow absolute right-8 bottom-28 z-10 flex items-center gap-2 bg-bg-2/90 px-3 py-1.5 text-red">
      <span className="h-2 w-2 rounded-full bg-red" /> Data delayed
    </div>
  );
}

function PreView({ state }: { state: DisplayState }) {
  const now = useNow();
  return (
    <div className="grid h-full grid-rows-[1fr_96px]">
      <div className="flex items-center justify-center gap-24 px-24">
        <img src="/brand/mascot_iboh%20(1).png" alt="" className="max-h-[640px] max-w-[560px] object-contain" />
        <div className="flex flex-col items-start">
          <img src="/brand/logo_with_text.png" alt="" className="max-h-[200px]" />
          <p className="eyebrow mt-10 text-cyan">14 November 2026 · GMT+8</p>
          <p className="eyebrow mt-8 text-fg-muted">CTF starts in</p>
          <p className="glitch font-display text-[180px] leading-none font-bold">
            <Mono text={state.game ? fmtDuration(state.game.start - now) : '--:--:--'} />
          </p>
        </div>
      </div>
      <Ticker />
    </div>
  );
}

function EndedView() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-40 text-center">
      <img src="/brand/logo_with_text.png" alt="" className="max-h-[180px]" />
      <h1 className="glitch mt-16 font-display text-[88px] leading-tight font-bold uppercase">
        IBOH 2026 has officially ended.
      </h1>
      <p className="mt-8 font-display text-5xl text-cyan">Please proceed to {VENUE}.</p>
    </div>
  );
}

function LiveView({ state, delayed }: { state: DisplayState; delayed: boolean }) {
  return (
    <div className="grid h-full grid-rows-[120px_1fr_96px]">
      <Boundary name="top">
        <TopBar state={state} delayed={delayed} />
      </Boundary>
      <div className="grid min-h-0 grid-cols-[360px_1fr_460px] gap-6 px-8 py-6">
        <Boundary name="stats">
          <StatsPanel state={state} />
        </Boundary>
        <Boundary name="center">
          <Panel title="Featured">
            <div className="relative h-full">
              {/* Idle (nothing queued, loop off or skipping): brand mark, never a blank panel. */}
              <div className="absolute inset-0 flex items-center justify-center">
                <img src="/brand/logo_with_text.png" alt="" className="max-h-[260px] opacity-30" />
              </div>
              <div className="absolute inset-0 bg-bg-2" style={{ opacity: state.now && !isFullscreen(state.now) ? 1 : 0 }} />
              <Featured now={state.now && !isFullscreen(state.now) ? state.now : null} />
            </div>
          </Panel>
        </Boundary>
        <Boundary name="solves">
          <SolveFeed solves={state.solves} />
        </Boundary>
      </div>
      <Boundary name="ticker">
        <Ticker />
      </Boundary>
    </div>
  );
}

function TopBar({ state, delayed }: { state: DisplayState; delayed: boolean }) {
  const now = useNow();
  return (
    <header className="flex items-center justify-between border-b border-line bg-bg-2/80 px-8">
      <div className="flex w-[440px] items-center gap-4">
        <img src="/brand/logo.png" alt="" className="h-16" />
        <span className="font-display text-3xl font-bold tracking-wide">IBOH 2026</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="eyebrow text-fg-muted">Time remaining</span>
        <span className="font-display text-7xl leading-none font-bold">
          <Mono text={state.game ? fmtDuration(state.game.end - now) : '--:--:--'} />
        </span>
      </div>
      <div className="flex w-[440px] items-center justify-end gap-6">
        {state.mock && <span className="eyebrow border border-hair px-2 py-1 text-fg-muted">Mock</span>}
        <span className="font-display text-3xl text-fg-muted">
          <Mono text={fmtClock(now)} />
        </span>
        <span className={`eyebrow flex items-center gap-2 ${delayed ? 'text-red' : 'text-cyan'}`}>
          <span className={`h-3 w-3 rounded-full ${delayed ? 'bg-red' : 'bg-cyan'}`} /> Live
        </span>
      </div>
    </header>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="hud flex min-h-0 flex-col border border-line bg-bg-2/85 p-6">
      <h2 className="eyebrow mb-4 text-cyan">{title}</h2>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function StatsPanel({ state }: { state: DisplayState }) {
  const { teams, solves, flagsPerMin } = state.stats;
  const challenges = state.scoreboard.challenges;
  return (
    <Panel title="Live stats">
      <div className="flex h-full flex-col justify-between">
        <Stat label="Teams" values={teams} />
        <Stat label="Solves" values={solves} />
        <Stat label="Flags / min" values={flagsPerMin} decimals={1} />
        <ChallengeStat solved={challenges.filter((c) => c.solvedCount > 0).length} total={challenges.length} />
      </div>
    </Panel>
  );
}

function Stat({ label, values, decimals = 0 }: { label: string; values: PerDivision<number>; decimals?: number }) {
  return (
    <div>
      <div className="eyebrow text-fg-muted">{label}</div>
      <div className="font-display text-6xl leading-tight font-bold">
        <CountUp value={values.Local + values.International} decimals={decimals} />
      </div>
      {(['Local', 'International'] as const).map((d) => (
        <div key={d} className="flex justify-between font-display text-2xl leading-snug text-fg-muted">
          <span>{d}</span>
          <span className="text-fg">
            <CountUp value={values[d]} decimals={decimals} />
          </span>
        </div>
      ))}
    </div>
  );
}

function ChallengeStat({ solved, total }: { solved: number; total: number }) {
  return (
    <div>
      <div className="eyebrow text-fg-muted">Challenges solved</div>
      <div className="font-display text-6xl leading-tight font-bold">
        <CountUp value={solved} />
        <span className="text-4xl text-fg-muted"> / {total}</span>
      </div>
      <div className="mt-2 h-2 bg-hair">
        <motion.div
          className="h-full bg-cyan"
          animate={{ width: total ? `${(solved / total) * 100}%` : '0%' }}
          transition={{ duration: 1, ease: [0.2, 0.7, 0.2, 1] }}
        />
      </div>
    </div>
  );
}

function DivisionTag({ division }: { division: Division }) {
  return (
    <span
      className={`eyebrow shrink-0 px-2 py-0.5 text-[13px] ${
        division === 'Local' ? 'bg-cyan text-bg' : 'border border-cyan text-cyan'
      }`}
    >
      {division}
    </span>
  );
}

function SolveFeed({ solves }: { solves: Solve[] }) {
  return (
    <Panel title="Latest solves">
      <ul className="flex h-full flex-col gap-2 overflow-hidden">
        <AnimatePresence initial={false}>
          {solves.map((s) => (
            <motion.li
              key={s.id}
              layout
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              className={`flex h-[82px] shrink-0 flex-col justify-center gap-1 px-4 ${
                s.blood ? 'bg-red/20' : 'bg-bg/60'
              }`}
            >
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate font-display text-2xl font-semibold">{s.teamName}</span>
                <span className="font-display text-xl text-fg-muted">{fmtClock(s.time)}</span>
              </div>
              <div className="flex items-center gap-3">
                <DivisionTag division={s.division} />
                {s.blood && <span className="eyebrow shrink-0 text-[13px] text-red">{ordinal(s.blood)} blood</span>}
                <span className="min-w-0 truncate text-lg text-fg-muted">
                  {s.challenge} <span className="text-fg-muted/60">· {s.category}</span>
                </span>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Panel>
  );
}

// ponytail: brand text until sponsor logo uploads (phase 5).
function Ticker() {
  const items = Array.from({ length: 8 }, (_, i) => (
    <span key={i} className="eyebrow mx-12 text-xl text-fg-muted">
      International Battle of Hackers 2026 <span className="mx-12 text-cyan">◆</span>
    </span>
  ));
  return (
    <footer className="flex items-center overflow-hidden border-t border-line bg-bg-2/80">
      <div className="ticker flex shrink-0 whitespace-nowrap">
        <div className="flex">{items}</div>
        <div className="flex">{items}</div>
      </div>
    </footer>
  );
}

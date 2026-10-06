import type { DisplayState, Division, PerDivision, Solve } from '@iboh/shared';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Boundary } from '../Boundary';
import { CountUp, Mono } from '../CountUp';
import { ordinal } from '../templates/events';
import { Featured, isFullscreen, Wipe } from './Featured';
import { Stage } from '../Stage';
import { fmtClock, fmtDuration, useNow, useServerState } from '../server';

export function Display() {
  const { state, connected } = useServerState();
  const delayed = !state || !connected || state.dataDelayed;
  return (
    <Stage>
      <AnimatePresence mode="wait">
        <motion.div key={state?.phase ?? 'boot'} className="absolute inset-0 overflow-hidden" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
          <Wipe duration={0.9}>
            {!state ? (
              <Splash />
            ) : state.phase === 'pre' ? (
              <PreView state={state} />
            ) : state.phase === 'live' ? (
              <LiveView state={state} delayed={delayed} />
            ) : (
              <EndedView venue={state.venue} />
            )}
          </Wipe>
        </motion.div>
      </AnimatePresence>
      {state && <Overlay state={state} />}
      {state && delayed && <DelayedBadge />}
      <div className="scanlines" aria-hidden />
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
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/85">
      <div className="hud hud-frame relative h-[760px] w-[1280px] overflow-hidden border border-line bg-bg-2 p-10">
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
    <div className="plate plate-red absolute right-8 bottom-28 z-30 gap-2 text-lg">
      <span className="h-2.5 w-2.5 rounded-full bg-bg" /> Data delayed
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
          <p className="mt-10 font-display text-3xl font-semibold text-cyan">14 November 2026 · GMT+8</p>
          <div className="mt-10">
            <span className="plate plate-cyan text-2xl">CTF starts in</span>
            <p className="glitch font-display text-[180px] leading-none font-bold">
              <Mono text={state.game ? fmtDuration(state.game.start - now) : '--:--:--'} />
            </p>
          </div>
        </div>
      </div>
      <Ticker logos={state.logos} />
    </div>
  );
}

function EndedView({ venue }: { venue: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-40 text-center">
      <img src="/brand/logo_with_text.png" alt="" className="max-h-[180px]" />
      <h1 className="glitch hit mt-16 font-display text-[96px] leading-tight font-bold uppercase" style={{ animationDelay: '0.5s' }}>
        IBOH 2026 has officially ended.
      </h1>
      <p className="extend mt-10" style={{ animationDelay: '0.9s' }}>
        <span className="plate plate-cyan px-6 py-3 text-5xl normal-case">Please proceed to {venue}.</span>
      </p>
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
          <Panel>
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
        <Ticker logos={state.logos} />
      </Boundary>
    </div>
  );
}

function TopBar({ state, delayed }: { state: DisplayState; delayed: boolean }) {
  const now = useNow();
  return (
    <header className="relative flex items-center justify-between border-b-2 border-cyan/40 bg-bg-2/90 px-8">
      <div className="flex w-[440px] items-center gap-4">
        <img src="/brand/logo.png" alt="" className="h-16" />
        <span className="font-display text-3xl font-bold tracking-wide">IBOH 2026</span>
      </div>
      <div className="flex items-center gap-5">
        <span className="font-display text-xl leading-tight font-semibold text-fg-muted uppercase">
          Time
          <br />
          remaining
        </span>
        <span className="font-display text-[84px] leading-none font-bold">
          <Mono text={state.game ? fmtDuration(state.game.end - now) : '--:--:--'} />
        </span>
      </div>
      <div className="flex w-[440px] items-center justify-end gap-6">
        {state.mock && <span className="plate plate-dark text-sm text-fg-muted">Mock</span>}
        <span className="font-display text-3xl text-fg-muted">
          <Mono text={fmtClock(now)} />
        </span>
        <span className={`plate text-xl ${delayed ? 'plate-red' : 'plate-cyan'} gap-2.5`}>
          <span className={`h-2.5 w-2.5 rounded-full bg-bg ${delayed ? '' : 'live-dot'}`} /> Live
        </span>
      </div>
      {/* A cyan segment under the timer anchors the eye on the most important number in the room. */}
      <div className="absolute -bottom-0.5 left-1/2 h-1 w-[520px] -translate-x-1/2 bg-cyan" />
    </header>
  );
}

function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="hud hud-frame relative flex min-h-0 flex-col border border-line bg-bg-2/90 p-6">
      {title && (
        <h2 className="mb-4 flex items-center gap-3 font-display text-lg font-bold tracking-[0.12em] text-cyan uppercase">
          <span className="h-3 w-3 bg-cyan" aria-hidden />
          {title}
        </h2>
      )}
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
      <div className="flex items-baseline justify-between">
        <span className="font-display text-6xl leading-tight font-bold">
          <CountUp value={values.Local + values.International} decimals={decimals} />
        </span>
        <span className="font-display text-lg font-semibold tracking-[0.08em] text-fg-muted uppercase">{label}</span>
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
      <div className="flex items-baseline justify-between">
        <span className="font-display text-6xl leading-tight font-bold">
          <CountUp value={solved} />
          <span className="text-4xl text-fg-muted"> / {total}</span>
        </span>
        <span className="font-display text-lg font-semibold tracking-[0.08em] text-fg-muted uppercase">Solved</span>
      </div>
      <div className="mt-2 h-2.5 bg-hair">
        <motion.div
          className="h-full origin-left bg-cyan"
          animate={{ scaleX: total ? solved / total : 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

function DivisionTag({ division }: { division: Division }) {
  return (
    <span
      className={`eyebrow shrink-0 px-2 py-0.5 text-[13px] font-semibold ${
        division === 'Local' ? 'bg-cyan text-bg' : 'text-cyan shadow-[inset_0_0_0_1.5px_var(--color-cyan)]'
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
              initial={{ opacity: 0, x: 120 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className={`flex h-[82px] shrink-0 flex-col justify-center gap-1 px-4 ${s.blood ? 'row-hit-blood bg-red/20' : 'row-hit bg-bg/60'}`}
            >
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate font-display text-2xl font-semibold">{s.teamName}</span>
                <span className="font-display text-xl text-fg-muted">{fmtClock(s.time)}</span>
              </div>
              <div className="flex items-center gap-3">
                <DivisionTag division={s.division} />
                {s.blood && <span className="plate plate-red shrink-0 text-[13px]">{ordinal(s.blood)} blood</span>}
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

function TickerMark() {
  return (
    <svg viewBox="0 0 20 20" className="mx-12 h-4 w-4 shrink-0" aria-hidden>
      <path d="M10 0 20 10 10 20 0 10Z" fill="var(--color-cyan)" />
    </svg>
  );
}

/** Sponsor logos on a seamless loop; brand text until logos are uploaded. */
function Ticker({ logos }: { logos: string[] }) {
  // Repeat short lists so one copy is always wider than the screen (the loop needs two copies to seam).
  const reps = logos.length ? Math.max(1, Math.ceil(8 / logos.length)) : 8;
  const items = Array.from({ length: reps }, (_, r) =>
    logos.length ? (
      logos.map((src) => <img key={`${r}-${src}`} src={src} alt="" className="mx-14 h-14 max-w-[260px] object-contain" />)
    ) : (
      <span key={r} className="flex items-center font-display text-xl font-semibold tracking-[0.14em] text-fg-muted uppercase">
        <span className="mx-12">International Battle of Hackers 2026</span>
        <TickerMark />
      </span>
    ),
  );
  return (
    <footer className="flex items-center overflow-hidden border-t-2 border-cyan/40 bg-bg-2/90">
      <div className="ticker flex shrink-0 whitespace-nowrap">
        <div className="flex">{items}</div>
        <div className="flex">{items}</div>
      </div>
    </footer>
  );
}

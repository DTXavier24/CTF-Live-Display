// Auto-event cards: bloods, Takeover, The Wall Falls, On Fire, Milestone, Team spotlight.
// Shared grammar: a solid plate names the event, the headline lands with `.hit`, details rise after.
import type { Division, TemplatePayloads } from '@iboh/shared';
import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { CountUp } from '../CountUp';
import { fmtClock } from '../server';
import type { TemplateProps } from './index';

const EASE = [0.16, 1, 0.3, 1] as const;
export const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** 1st blood is red, 2nd cyan, 3rd white: distinct at a glance from the back of the hall. */
const RANK = {
  1: { plate: 'plate-red', text: 'text-red' },
  2: { plate: 'plate-cyan', text: 'text-cyan' },
  3: { plate: 'plate-fg', text: 'text-fg' },
} as const;

/** The event's name on a solid plate, extending from its left edge. */
export function EventPlate({ tone, children, className = '', delay = 0.25, size = 'text-[64px]' }: { tone: string; children: ReactNode; className?: string; delay?: number; size?: string }) {
  return (
    <div className={`extend shrink-0 ${className}`} style={{ animationDelay: `${delay}s` }}>
      <span className={`plate ${tone} ${size}`}>{children}</span>
    </div>
  );
}

function DivisionPlate({ division, delay = 0.35 }: { division: Division; delay?: number }) {
  return (
    <span className="extend inline-block" style={{ animationDelay: `${delay}s` }}>
      <span className={`plate text-2xl ${division === 'Local' ? 'plate-cyan' : 'plate-dark shadow-[inset_0_0_0_2px_var(--color-cyan)]'}`}>
        {division}
      </span>
    </span>
  );
}

/** Slides up into place after the headline has landed. */
function Rise({ delay = 0, children, className = '' }: { delay?: number; children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.5, ease: EASE }}>
      {children}
    </motion.div>
  );
}

export function Blood({ item }: TemplateProps<'blood'>) {
  const p = item.payload as TemplatePayloads['blood'];
  const tone = RANK[p.rank];
  return (
    <div className={`relative flex h-full flex-col justify-center overflow-hidden px-6 ${tone.text}`}>
      <div className="stripes" />
      <div className="relative flex items-center gap-4">
        <EventPlate tone={tone.plate}>{ordinal(p.rank)} blood</EventPlate>
        <DivisionPlate division={p.division} />
      </div>
      <p className="glitch hit relative mt-10 truncate font-display text-[104px] leading-none font-bold text-fg" style={{ animationDelay: '0.45s' }}>
        {p.team}
      </p>
      <Rise delay={0.8} className="relative mt-4 text-4xl text-fg-muted">
        by <span className="font-semibold text-fg">{p.player || 'unknown player'}</span>
      </Rise>
      <Rise delay={1} className="relative mt-12 flex items-center gap-5 text-fg">
        <span className="bg-bg px-5 py-3 font-display text-4xl font-semibold shadow-[inset_0_0_0_2px_currentColor]">{p.challenge}</span>
        <span className={`font-display text-2xl font-bold tracking-[0.1em] uppercase ${tone.text}`}>{p.category}</span>
        <span className="ml-auto font-display text-4xl text-fg-muted">{fmtClock(p.time)}</span>
      </Rise>
    </div>
  );
}

export function Takeover({ item }: TemplateProps<'takeover'>) {
  const p = item.payload as TemplatePayloads['takeover'];
  // Start in the old order, then the challenger drives past the old leader.
  const [swapped, setSwapped] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSwapped(true), 1500);
    return () => clearTimeout(t);
  }, []);
  const rows = [
    { key: 'leader', name: p.leader.name, score: p.leader.score, isLeader: true },
    { key: 'dethroned', name: p.dethroned.name, score: p.dethroned.score, isLeader: false },
  ];
  const order = swapped ? rows : [...rows].reverse();
  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden px-6 text-red">
      <div className="stripes" />
      <div className="relative flex items-center gap-4">
        <EventPlate tone="plate-red">Takeover</EventPlate>
        <DivisionPlate division={p.division} />
      </div>
      <div className="relative mt-12 flex flex-col gap-4 text-fg">
        {order.map((r, i) => {
          const lead = swapped && r.isLeader;
          return (
            <motion.div
              key={r.key}
              layout
              initial={{ opacity: 0, x: -80 }}
              animate={{ opacity: 1, x: 0, scale: lead ? 1.03 : 1 }}
              transition={{ layout: { type: 'spring', stiffness: 140, damping: 16 }, delay: 0.5 + i * 0.12, duration: 0.45, ease: EASE }}
              className={`flex h-32 items-center gap-8 px-8 ${lead ? 'bg-cyan text-bg' : 'bg-bg/80'}`}
            >
              <span className={`w-24 font-display text-7xl font-bold ${lead ? '' : 'text-cyan'}`}>#{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-display text-6xl font-bold">{r.name}</span>
              <span className="font-display text-6xl font-bold tabular-nums">{r.score}</span>
            </motion.div>
          );
        })}
      </div>
      <Rise delay={2.1} className="relative mt-8 text-right font-display text-5xl font-semibold text-fg-muted">
        Leads by <span className="text-cyan">{p.gap}</span> pts
      </Rise>
    </div>
  );
}

function fmtStood(ms: number) {
  const m = Math.floor(ms / 60_000);
  return `${Math.floor(m / 60)}H ${m % 60}M`;
}

const TILE_COLS = 10;
const TILE_ROWS = 6;

export function WallFalls({ item }: TemplateProps<'wall-falls'>) {
  const p = item.payload as TemplatePayloads['wall-falls'];
  // Deterministic per tile so a re-render never reshuffles the fall.
  const tiles = Array.from({ length: TILE_COLS * TILE_ROWS }, (_, i) => {
    const r = Math.sin(i * 12.9898) * 43758.5453;
    const rand = r - Math.floor(r);
    return { i, rot: (rand - 0.5) * 90, dx: (rand - 0.5) * 220, delay: 1.25 + (Math.floor(i / TILE_COLS) / TILE_ROWS) * 0.45 + rand * 0.3 };
  });
  return (
    <div className="relative h-full overflow-hidden">
      <div className="flex h-full flex-col justify-center px-6">
        <span className="plate plate-red self-start text-[64px]">The wall falls</span>
        <p className="mt-8 font-display text-7xl font-bold">{p.challenge}</p>
        <p className="mt-3 font-display text-4xl text-fg-muted">
          Unsolved for <span className="font-bold text-red">{fmtStood(p.stoodMs)}</span> · {p.category}
        </p>
        <p className="glitch hit mt-12 truncate font-display text-[96px] leading-none font-bold text-cyan" style={{ animationDelay: '1.7s' }}>
          {p.team}
        </p>
        <p className="mt-4 text-3xl text-fg-muted">
          by {p.player || 'unknown player'} · {p.division}
        </p>
      </div>
      {/* The wall: holds, shudders once, then breaks apart to reveal the solver. */}
      <motion.div
        className="absolute inset-0 grid"
        style={{ gridTemplateColumns: `repeat(${TILE_COLS}, 1fr)` }}
        animate={{ x: [0, -10, 9, -6, 4, 0] }}
        transition={{ delay: 0.75, duration: 0.45, ease: 'easeOut' }}
      >
        {tiles.map((t) => (
          <motion.div
            key={t.i}
            className="border-2 border-bg bg-bg-2"
            style={{ backgroundImage: 'linear-gradient(135deg, rgba(240,92,85,0.22), transparent 65%)' }}
            initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
            animate={{ y: 1000, x: t.dx, rotate: t.rot, opacity: 0 }}
            transition={{ delay: t.delay, duration: 0.9, ease: [0.55, 0, 0.8, 0.2] }}
          />
        ))}
        <motion.span
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-[64px] font-bold tracking-[0.2em] text-red/60 uppercase"
          animate={{ opacity: 0, scale: 1.15 }}
          transition={{ delay: 1.2, duration: 0.3 }}
        >
          Unsolved
        </motion.span>
      </motion.div>
    </div>
  );
}

export function OnFire({ item }: TemplateProps<'on-fire'>) {
  const p = item.payload as TemplatePayloads['on-fire'];
  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden px-6">
      {/* Heat rising from the bottom edge: breathes slowly, never flashes. */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-full origin-bottom"
        style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 100%, rgba(240,92,85,0.6), rgba(240,140,60,0.22) 45%, transparent 75%)' }}
        initial={{ opacity: 0, scaleY: 0.4 }}
        animate={{ opacity: [0.75, 1, 0.75], scaleY: [1, 1.1, 1] }}
        transition={{ opacity: { duration: 3, repeat: Infinity, ease: 'easeInOut' }, scaleY: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }}
      />
      <div className="relative flex items-center gap-4">
        <EventPlate tone="plate-red">On fire</EventPlate>
        <DivisionPlate division={p.division} />
      </div>
      <p className="glitch hit relative mt-10 truncate font-display text-[104px] leading-none font-bold" style={{ animationDelay: '0.45s' }}>
        {p.team}
      </p>
      <Rise delay={0.8} className="relative mt-4 font-display text-5xl font-semibold text-fg-muted">
        <span className="text-red">{p.count}</span> solves in a row
      </Rise>
      <div className="relative mt-12 flex flex-wrap gap-3">
        {p.challenges.map((c, i) => (
          <Rise key={c} delay={1 + i * 0.12}>
            <span className="bg-bg/80 px-5 py-2.5 font-display text-3xl font-semibold shadow-[inset_0_0_0_2px_var(--color-red)]">{c}</span>
          </Rise>
        ))}
      </div>
    </div>
  );
}

export function Milestone({ item }: TemplateProps<'milestone'>) {
  const p = item.payload as TemplatePayloads['milestone'];
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden text-center">
      {/* Two rings expand once from behind the number as it lands. */}
      {[0, 0.25].map((d) => (
        <motion.span
          key={d}
          aria-hidden
          className="absolute h-[420px] w-[420px] rounded-full border-4 border-cyan"
          initial={{ scale: 0.3, opacity: 0.9 }}
          animate={{ scale: 2.4, opacity: 0 }}
          transition={{ delay: 0.5 + d, duration: 1.4, ease: EASE }}
        />
      ))}
      <span className="extend relative" style={{ animationDelay: '0.2s' }}>
        <span className="plate plate-cyan text-5xl">Milestone</span>
      </span>
      <p className="glitch hit relative font-display text-[260px] leading-none font-bold" style={{ animationDelay: '0.35s' }}>
        <CountUp value={p.milestone} from={Math.max(0, p.milestone - 60)} />
      </p>
      <p className="relative font-display text-3xl font-semibold tracking-[0.14em] text-fg-muted uppercase">Flags captured</p>
      <Rise delay={1.3} className="relative mt-12">
        <p className="font-display text-5xl font-semibold">
          Flag #{p.milestone} by <span className="text-cyan">{p.player || p.team}</span>
        </p>
        <p className="mt-3 text-3xl text-fg-muted">
          {p.team} · {p.division}
        </p>
      </Rise>
    </div>
  );
}

export function Spotlight({ item }: TemplateProps<'spotlight'>) {
  const p = item.payload as TemplatePayloads['spotlight'];
  const stats = [
    ['Rank', `#${p.rank}`],
    ['Score', String(p.score)],
    ['Solves', String(p.solvedCount)],
    ['Strongest', p.topCategory ?? '-'],
  ];
  return (
    <div className="relative flex h-full flex-col justify-center px-6">
      <div className="flex items-center gap-4">
        <EventPlate tone="plate-cyan">Spotlight</EventPlate>
        <DivisionPlate division={p.division} />
      </div>
      <p className="glitch hit mt-10 truncate font-display text-[104px] leading-none font-bold" style={{ animationDelay: '0.45s' }}>
        {p.name}
      </p>
      <div className="mt-12 grid grid-cols-4 gap-4">
        {stats.map(([text, value], i) => (
          <Rise key={text} delay={0.8 + i * 0.1} className="bg-bg/80 px-6 py-5">
            <p className="font-display text-lg font-semibold tracking-[0.1em] text-fg-muted uppercase">{text}</p>
            <p className="truncate font-display text-6xl font-bold">{value}</p>
          </Rise>
        ))}
      </div>
      {p.players.length > 0 && (
        <Rise delay={1.3} className="mt-10 font-display text-4xl">
          <span className="text-fg-muted">Players </span>
          {p.players.join('  ·  ')}
        </Rise>
      )}
    </div>
  );
}

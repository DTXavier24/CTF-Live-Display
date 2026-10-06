// Auto-event cards: bloods, Takeover, The Wall Falls, On Fire, Milestone, Team spotlight.
import type { Division, TemplatePayloads } from '@iboh/shared';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { CountUp } from '../CountUp';
import { fmtClock } from '../server';
import type { TemplateProps } from './index';

const EASE = [0.2, 0.7, 0.2, 1] as const;
export const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const BLOOD_COLOR = { 1: 'text-red', 2: 'text-cyan', 3: 'text-fg' } as const;

function DivisionLabel({ division, className = '' }: { division: Division; className?: string }) {
  return <p className={`eyebrow text-2xl text-fg-muted ${className}`}>{division} division</p>;
}

/** Slides up into place, staggered by `delay`. */
function Rise({ delay = 0, children, className = '' }: { delay?: number; children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.6, ease: EASE }}>
      {children}
    </motion.div>
  );
}

export function Blood({ item }: TemplateProps<'blood'>) {
  const p = item.payload as TemplatePayloads['blood'];
  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden px-6">
      {/* A slash wipes across before the text lands. */}
      <motion.div
        className={`absolute inset-y-0 -left-1/4 w-1/3 -skew-x-12 ${p.rank === 1 ? 'bg-red/25' : p.rank === 2 ? 'bg-cyan/20' : 'bg-fg/10'}`}
        initial={{ x: '-120%' }}
        animate={{ x: '420%' }}
        transition={{ duration: 0.9, ease: EASE }}
      />
      <Rise>
        <DivisionLabel division={p.division} />
      </Rise>
      <Rise delay={0.15}>
        <p className={`glitch font-display text-[120px] leading-none font-bold uppercase ${BLOOD_COLOR[p.rank]}`}>{ordinal(p.rank)} blood</p>
      </Rise>
      <Rise delay={0.35}>
        <p className="mt-8 truncate font-display text-7xl font-bold">{p.team}</p>
        <p className="mt-2 text-3xl text-fg-muted">by {p.player || 'unknown player'}</p>
      </Rise>
      <Rise delay={0.55} className="mt-10 flex items-center gap-5">
        <span className="border border-line bg-bg/60 px-4 py-2 font-display text-3xl">{p.challenge}</span>
        <span className="eyebrow text-xl text-cyan">{p.category}</span>
        <span className="ml-auto font-display text-3xl text-fg-muted">{fmtClock(p.time)}</span>
      </Rise>
    </div>
  );
}

export function Takeover({ item }: TemplateProps<'takeover'>) {
  const p = item.payload as TemplatePayloads['takeover'];
  // Start in the old order, then the challenger moves past the old leader.
  const [swapped, setSwapped] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSwapped(true), 1300);
    return () => clearTimeout(t);
  }, []);
  const rows = [
    { key: 'leader', name: p.leader.name, score: p.leader.score, isLeader: true },
    { key: 'dethroned', name: p.dethroned.name, score: p.dethroned.score, isLeader: false },
  ];
  const order = swapped ? rows : [...rows].reverse();
  return (
    <div className="flex h-full flex-col justify-center px-6">
      <Rise>
        <p className="eyebrow text-2xl text-red">Takeover</p>
        <p className="font-display text-8xl font-bold uppercase">
          New #1 <span className="text-cyan">· {p.division}</span>
        </p>
      </Rise>
      <div className="mt-12 flex flex-col gap-4">
        {order.map((r, i) => (
          <motion.div
            key={r.key}
            layout
            transition={{ type: 'spring', stiffness: 90, damping: 18 }}
            className={`flex h-28 items-center gap-8 px-8 ${swapped && r.isLeader ? 'bg-cyan/15' : 'bg-bg/60'}`}
          >
            <span className="w-20 font-display text-6xl font-bold text-cyan">#{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-display text-6xl font-bold">{r.name}</span>
            <span className="font-display text-5xl tabular-nums">{r.score}</span>
          </motion.div>
        ))}
      </div>
      <Rise delay={1.9} className="mt-8 text-right font-display text-4xl text-fg-muted">
        Lead by <span className="text-cyan">{p.gap}</span> pts
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
    return { i, rot: (rand - 0.5) * 70, dx: (rand - 0.5) * 160, delay: 0.9 + (Math.floor(i / TILE_COLS) / TILE_ROWS) * 0.5 + rand * 0.35 };
  });
  return (
    <div className="relative h-full overflow-hidden">
      <div className="flex h-full flex-col justify-center px-6">
        <p className="eyebrow text-2xl text-red">The wall falls</p>
        <p className="font-display text-7xl font-bold">{p.challenge}</p>
        <p className="mt-3 font-display text-4xl text-fg-muted">
          Unsolved for <span className="text-red">{fmtStood(p.stoodMs)}</span> · {p.category}
        </p>
        <p className="mt-12 truncate font-display text-7xl font-bold text-cyan">{p.team}</p>
        <p className="mt-2 text-3xl text-fg-muted">
          by {p.player || 'unknown player'} · {p.division}
        </p>
      </div>
      {/* The wall: tiles crack, then fall away to reveal the solver. */}
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${TILE_COLS}, 1fr)` }}>
        {tiles.map((t) => (
          <motion.div
            key={t.i}
            className="border border-bg bg-bg-2"
            style={{ backgroundImage: 'linear-gradient(135deg, rgba(240,92,85,0.12), transparent 60%)' }}
            initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
            animate={{ y: 900, x: t.dx, rotate: t.rot, opacity: 0 }}
            transition={{ delay: t.delay, duration: 1.1, ease: [0.5, 0, 0.75, 0] }}
          />
        ))}
      </div>
    </div>
  );
}

export function OnFire({ item }: TemplateProps<'on-fire'>) {
  const p = item.payload as TemplatePayloads['on-fire'];
  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden px-6">
      {/* Slow heat glow rising from the bottom: breathes, never flashes. */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(240,92,85,0.45), rgba(240,140,60,0.18) 40%, transparent 70%)' }}
        animate={{ opacity: [0.6, 1, 0.6], scaleY: [1, 1.08, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <Rise className="relative">
        <DivisionLabel division={p.division} />
        <p className="glitch font-display text-[120px] leading-none font-bold text-red uppercase">On fire</p>
      </Rise>
      <Rise delay={0.3} className="relative">
        <p className="mt-6 truncate font-display text-7xl font-bold">{p.team}</p>
        <p className="mt-2 font-display text-4xl text-fg-muted">
          <span className="text-red">{p.count}</span> solves in a row
        </p>
      </Rise>
      <div className="relative mt-10 flex flex-wrap gap-3">
        {p.challenges.map((c, i) => (
          <Rise key={c} delay={0.6 + i * 0.15}>
            <span className="border border-red/50 bg-bg/70 px-4 py-2 font-display text-3xl">{c}</span>
          </Rise>
        ))}
      </div>
    </div>
  );
}

export function Milestone({ item }: TemplateProps<'milestone'>) {
  const p = item.payload as TemplatePayloads['milestone'];
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="eyebrow text-2xl text-cyan">Milestone</p>
      <p className="glitch font-display text-[220px] leading-none font-bold">
        <CountUp value={p.milestone} from={0} />
      </p>
      <p className="eyebrow mt-2 text-3xl text-fg-muted">Flags captured</p>
      <Rise delay={1.2} className="mt-12">
        <p className="font-display text-5xl">
          Flag #{p.milestone} by <span className="text-cyan">{p.player || p.team}</span>
        </p>
        <p className="mt-2 text-3xl text-fg-muted">
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
    <div className="flex h-full flex-col justify-center px-6">
      <Rise>
        <p className="eyebrow text-2xl text-cyan">Team spotlight</p>
        <p className="truncate font-display text-8xl font-bold">{p.name}</p>
        <DivisionLabel division={p.division} className="mt-2" />
      </Rise>
      <div className="mt-12 grid grid-cols-4 gap-4">
        {stats.map(([label, value], i) => (
          <Rise key={label} delay={0.3 + i * 0.12} className="bg-bg/60 px-6 py-5">
            <p className="eyebrow text-lg text-fg-muted">{label}</p>
            <p className="truncate font-display text-5xl font-bold">{value}</p>
          </Rise>
        ))}
      </div>
      {p.players.length > 0 && (
        <Rise delay={0.9} className="mt-10">
          <p className="eyebrow text-lg text-fg-muted">Players</p>
          <p className="mt-2 font-display text-3xl">{p.players.join('  ·  ')}</p>
        </Rise>
      )}
    </div>
  );
}

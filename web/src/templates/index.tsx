// Template components, keyed by template id. Adding an event type = a server entry in
// server/src/templates.ts + a component here. The featured container never changes.
import type { NowPlaying, TemplateId, TemplatePayloads } from '@iboh/shared';
import { motion } from 'motion/react';
import type { FC } from 'react';
import { Mono } from '../CountUp';
import { fmtDuration, useNow } from '../server';
import { Blood, EventPlate, Milestone, OnFire, Spotlight, Takeover, WallFalls } from './events';
import { Top10 } from './Top10';

export interface TemplateProps<K extends TemplateId> {
  item: Extract<NowPlaying, { template: K }>;
  ready: () => void;
  done: () => void;
  fail: (reason: string) => void;
}

interface TemplateEntry {
  component: FC<TemplateProps<any>>;
  /** Takes over the whole stage instead of the center panel. */
  fullscreen?: boolean;
}

function Countdown({ item }: TemplateProps<'countdown-start' | 'countdown-end'>) {
  const { target, label } = item.payload as TemplatePayloads['countdown-end'];
  const now = useNow();
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <EventPlate tone="plate-cyan" className="mb-6">
        {label}
      </EventPlate>
      <p className="glitch hit font-display text-[180px] leading-none font-bold" style={{ animationDelay: '0.4s' }}>
        <Mono text={fmtDuration(target - now)} />
      </p>
    </div>
  );
}

function Announcement({ item }: TemplateProps<'announcement'>) {
  const { title, body } = item.payload as TemplatePayloads['announcement'];
  return (
    <div className="dots relative flex h-full flex-col justify-center overflow-hidden px-40 text-red">
      {/* Hazard bands top and bottom frame the whole screen as an interruption. */}
      <div className="absolute inset-x-0 top-0 h-6 overflow-hidden">
        <div className="stripes opacity-60" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-6 overflow-hidden">
        <div className="stripes opacity-60" />
      </div>
      <EventPlate tone="plate-red" delay={0.35}>
        Announcement
      </EventPlate>
      <h1 className="glitch hit mt-10 font-display text-[120px] leading-[1.02] font-bold text-fg uppercase" style={{ animationDelay: '0.55s' }}>
        {title}
      </h1>
      {body && (
        <motion.p
          className="mt-10 max-w-[1400px] text-5xl leading-snug text-fg/90"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.95, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {body}
        </motion.p>
      )}
    </div>
  );
}

function Unsolved({ item }: TemplateProps<'unsolved'>) {
  const { categories, total } = item.payload as TemplatePayloads['unsolved'];
  return (
    <div className="flex h-full flex-col">
      <div className="mb-8 flex items-center gap-5">
        <EventPlate tone="plate-red">Still unsolved</EventPlate>
        <span className="glitch hit font-display text-7xl font-bold text-red tabular-nums" style={{ animationDelay: '0.4s' }}>
          {total}
        </span>
      </div>
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-x-8 gap-y-7 overflow-hidden">
        {categories.map((c, i) => (
          <motion.div
            key={c.category}
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55 + 0.08 * i, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="mb-2 font-display text-xl font-bold tracking-[0.12em] text-cyan uppercase">{c.category}</p>
            <ul className="flex flex-wrap gap-2">
              {c.challenges.map((name) => (
                <li key={name} className="bg-bg/80 px-4 py-2 font-display text-3xl font-semibold shadow-[inset_0_0_0_2px_var(--color-red)]">
                  {name}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Loop breather: just the Battle of Hackers mark, settling in. */
function Idle() {
  return (
    <div className="flex h-full items-center justify-center">
      <motion.img
        src="/brand/logo_with_text.png"
        alt="Battle of Hackers"
        className="max-h-[360px] max-w-[80%] object-contain"
        initial={{ opacity: 0, scale: 1.08, filter: 'blur(14px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ delay: 0.4, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}


export const templateComponents: Record<TemplateId, TemplateEntry> = {
  'countdown-start': { component: Countdown },
  'countdown-end': { component: Countdown },
  announcement: { component: Announcement, fullscreen: true },
  top10: { component: Top10 },
  unsolved: { component: Unsolved },
  idle: { component: Idle },
  blood: { component: Blood },
  takeover: { component: Takeover },
  'wall-falls': { component: WallFalls },
  'on-fire': { component: OnFire },
  milestone: { component: Milestone },
  spotlight: { component: Spotlight },
};

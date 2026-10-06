// Template components, keyed by template id. Adding an event type = a server entry in
// server/src/templates.ts + a component here. The featured container never changes.
import type { NowPlaying, TemplateId, TemplatePayloads } from '@iboh/shared';
import { motion } from 'motion/react';
import type { FC } from 'react';
import { Mono } from '../CountUp';
import { fmtDuration, useNow } from '../server';
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
  /** Reports ready itself (after media loads) instead of on mount. */
  waitsForMedia?: boolean;
}

function Countdown({ item }: TemplateProps<'countdown-start' | 'countdown-end'>) {
  const { target, label } = item.payload as TemplatePayloads['countdown-end'];
  const now = useNow();
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <p className="eyebrow text-2xl text-fg-muted">{label}</p>
      <p className="glitch mt-4 font-display text-[150px] leading-none font-bold"><Mono text={fmtDuration(target - now)} /></p>
    </div>
  );
}

function Announcement({ item }: TemplateProps<'announcement'>) {
  const { title, body } = item.payload as TemplatePayloads['announcement'];
  return (
    <div className="dots flex h-full flex-col justify-center px-40">
      <motion.div
        className="mb-10 h-2 bg-red"
        initial={{ width: 0 }}
        animate={{ width: 320 }}
        transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
      />
      <p className="eyebrow text-3xl text-red">Announcement</p>
      <h1 className="glitch mt-6 font-display text-[110px] leading-[1.02] font-bold uppercase">{title}</h1>
      {body && <p className="mt-10 max-w-[1400px] text-5xl leading-snug text-fg/90">{body}</p>}
    </div>
  );
}

function Unsolved({ item }: TemplateProps<'unsolved'>) {
  const { categories, total } = item.payload as TemplatePayloads['unsolved'];
  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-6 font-display text-5xl font-bold uppercase">
        Still unsolved <span className="text-red tabular-nums">· {total}</span>
      </h3>
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-x-8 gap-y-6 overflow-hidden">
        {categories.map((c, i) => (
          <motion.div key={c.category} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}>
            <p className="eyebrow mb-2 text-cyan">{c.category}</p>
            <ul className="flex flex-wrap gap-2">
              {c.challenges.map((name) => (
                <li key={name} className="border border-hair bg-bg/60 px-3 py-1.5 font-display text-2xl">
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

function SponsorVideo({ item, ready, done, fail }: TemplateProps<'sponsor-video'>) {
  const { url } = item.payload as TemplatePayloads['sponsor-video'];
  return (
    <video
      src={url}
      muted
      autoPlay
      playsInline
      preload="auto"
      onCanPlay={ready}
      onEnded={done}
      onError={() => fail(`video failed to load: ${url}`)}
      className="h-full w-full bg-black object-contain"
    />
  );
}

export const templateComponents: Record<TemplateId, TemplateEntry> = {
  'countdown-start': { component: Countdown },
  'countdown-end': { component: Countdown },
  announcement: { component: Announcement, fullscreen: true },
  top10: { component: Top10 },
  unsolved: { component: Unsolved },
  'sponsor-video': { component: SponsorVideo, waitsForMedia: true },
};

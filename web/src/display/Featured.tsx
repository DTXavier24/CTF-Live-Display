import type { NowPlaying } from '@iboh/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { Boundary } from '../Boundary';
import { report, serverNow } from '../server';
import { templateComponents } from '../templates';

export const isFullscreen = (now: NowPlaying) => !!templateComponents[now.template]?.fullscreen;

/** Renders the engine's current item with a wipe transition. A crash or media error skips it. */
export function Featured({ now }: { now: NowPlaying | null }) {
  return (
    <AnimatePresence mode="wait">
      {now && (
        <motion.div
          key={now.id}
          className="absolute inset-0"
          initial={{ clipPath: 'inset(0 0 0 100%)', opacity: 0.4 }}
          animate={{ clipPath: 'inset(0 0 0 0%)', opacity: 1 }}
          exit={{ clipPath: 'inset(0 100% 0 0)', opacity: 0.4 }}
          transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <Boundary name={`template:${now.template}`} onError={(err) => report(now.id, 'error', String(err))}>
            <Item now={now} />
          </Boundary>
          <Progress now={now} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Item({ now }: { now: NowPlaying }) {
  const entry = templateComponents[now.template];
  useEffect(() => {
    if (!entry) report(now.id, 'error', `no component for template ${now.template}`);
    else if (!entry.waitsForMedia) report(now.id, 'ready');
  }, [now.id]);
  if (!entry) return null;
  const Component = entry.component;
  return (
    <Component
      item={now}
      ready={() => report(now.id, 'ready')}
      done={() => report(now.id, 'done')}
      fail={(reason: string) => report(now.id, 'error', reason)}
    />
  );
}

/** Thin bar showing how long the item has left. Untimed items (videos) show none. */
function Progress({ now }: { now: NowPlaying }) {
  if (now.status !== 'playing' || !now.durationMs || !now.startedAt) return null;
  const elapsed = Math.min(now.durationMs, serverNow() - now.startedAt);
  return (
    <motion.div
      className="absolute bottom-0 left-0 h-1 w-full origin-left bg-cyan/70"
      initial={{ scaleX: elapsed / now.durationMs }}
      animate={{ scaleX: 1 }}
      transition={{ duration: (now.durationMs - elapsed) / 1000, ease: 'linear' }}
    />
  );
}

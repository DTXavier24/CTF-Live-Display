import type { NowPlaying } from '@iboh/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { Boundary } from '../Boundary';
import { report, serverNow } from '../server';
import { templateComponents } from '../templates';

export const isFullscreen = (now: NowPlaying) => !!templateComponents[now.template]?.fullscreen;

const WIPE_EASE = [0.76, 0, 0.24, 1] as const;

/**
 * The broadcast stinger: a solid cyan bar with a red trailing edge crosses the area and the new
 * content is revealed right behind it. Used for every featured item and every phase change.
 */
export function Wipe({ children, duration = 0.7 }: { children: ReactNode; duration?: number }) {
  return (
    <>
      <motion.div
        className="absolute inset-0"
        initial={{ clipPath: 'inset(0 100% 0 0)' }}
        animate={{ clipPath: 'inset(0 0% 0 0)' }}
        transition={{ duration, ease: WIPE_EASE, delay: duration * 0.12 }}
      >
        {children}
      </motion.div>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[16%]"
        style={{ background: 'linear-gradient(90deg, var(--color-red) 0 22%, var(--color-cyan) 22% 100%)' }}
        initial={{ x: '-100%' }}
        animate={{ x: '640%' }}
        transition={{ duration: duration * 1.05, ease: WIPE_EASE }}
      />
    </>
  );
}

/** Renders the engine's current item behind the stinger. A crash or media error skips it. */
export function Featured({ now }: { now: NowPlaying | null }) {
  return (
    <AnimatePresence mode="wait">
      {now && (
        <motion.div key={now.id} className="absolute inset-0 overflow-hidden" exit={{ opacity: 0, transition: { duration: 0.16 } }}>
          <Wipe>
            <Boundary name={`template:${now.template}`} onError={(err) => report(now.id, 'error', String(err))}>
              <Item now={now} />
            </Boundary>
            <Progress now={now} />
          </Wipe>
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

/** Bar showing how long the item has left. Untimed items (videos) show none. */
function Progress({ now }: { now: NowPlaying }) {
  if (now.status !== 'playing' || !now.durationMs || !now.startedAt) return null;
  const elapsed = Math.min(now.durationMs, serverNow() - now.startedAt);
  return (
    <motion.div
      className="absolute bottom-0 left-0 h-1.5 w-full origin-left bg-cyan"
      initial={{ scaleX: elapsed / now.durationMs }}
      animate={{ scaleX: 1 }}
      transition={{ duration: (now.durationMs - elapsed) / 1000, ease: 'linear' }}
    />
  );
}

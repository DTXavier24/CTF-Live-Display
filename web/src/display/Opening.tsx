// The opening: the moment the game starts. Plays once, when this screen sees pre-CTF turn into live.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

const EASE = [0.16, 1, 0.3, 1] as const;
const DOOR_EASE = [0.76, 0, 0.24, 1] as const;
const OPENING_S = 4.6;

/** True for the length of the opening sequence after the phase goes pre → live while this page is open. */
export function useOpening(phase: string | undefined) {
  const prev = useRef(phase);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (prev.current === 'pre' && phase === 'live') {
      prev.current = phase;
      setOn(true);
      const t = setTimeout(() => setOn(false), OPENING_S * 1000);
      // A further phase change mid-sequence (e.g. an admin override) ends it instead of freezing it.
      return () => {
        clearTimeout(t);
        setOn(false);
      };
    }
    prev.current = phase;
  }, [phase]);
  return on;
}

/** Keyframes for the whole sequence share one clock: \`at(seconds)\` turns a time into a keyframe offset. */
const at = (s: number) => s / OPENING_S;

export function GameOn({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div key="game-on" className="absolute inset-0 z-[60] overflow-hidden" exit={{ opacity: 0, transition: { duration: 0.25 } }}>
          {/* The doors: two halves that part down the middle to reveal the live layout behind. */}
          {(['left', 'right'] as const).map((side) => (
            <motion.div
              key={side}
              className={`dots absolute inset-y-0 w-1/2 bg-bg-2 ${side === 'left' ? 'left-0' : 'right-0'}`}
              animate={{ x: ['0%', '0%', side === 'left' ? '-101%' : '101%'] }}
              transition={{ duration: OPENING_S, times: [0, at(3.4), at(4.4)], ease: DOOR_EASE }}
            >
              <div className="stripes text-cyan" />
            </motion.div>
          ))}
          {/* The seam the doors split along: draws itself in, then flares as they open. */}
          <motion.div
            aria-hidden
            className="absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2 bg-cyan"
            initial={{ scaleY: 0, opacity: 1 }}
            animate={{ scaleY: [0, 1, 1, 1, 1, 1], opacity: [1, 1, 0, 0, 1, 0], scaleX: [1, 1, 1, 1, 5, 1] }}
            transition={{ duration: OPENING_S, times: [0, at(0.15), at(0.45), at(3.2), at(3.45), at(3.9)], ease: 'easeOut' }}
          />

          {/* The title card, on top of the closed doors. */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            animate={{ opacity: [1, 1, 0], scale: [1, 1, 1.12] }}
            transition={{ duration: OPENING_S, times: [0, at(3.3), at(3.7)], ease: 'easeIn' }}
          >
            {/* Shockwaves out of the centre as the countdown hits zero. */}
            {[
              { d: 0.05, c: 'border-cyan' },
              { d: 0.22, c: 'border-red' },
              { d: 0.42, c: 'border-cyan' },
            ].map(({ d, c }) => (
              <motion.span
                key={d}
                aria-hidden
                className={`absolute h-[520px] w-[520px] rounded-full border-[6px] ${c}`}
                initial={{ scale: 0.15, opacity: 0.95 }}
                animate={{ scale: 3.2, opacity: 0 }}
                transition={{ delay: d, duration: 1.3, ease: EASE }}
              />
            ))}
            <motion.img
              src="/brand/logo_with_text.png"
              alt=""
              className="relative h-[220px]"
              initial={{ scale: 1.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.65, ease: EASE }}
            />
            <p className="glitch hit relative mt-10 font-display text-[128px] leading-none font-bold uppercase" style={{ animationDelay: '0.55s' }}>
              Let the battle begin
            </p>
            <span className="extend relative mt-10" style={{ animationDelay: '1s' }}>
              <span className="plate plate-cyan text-5xl">Flags are open</span>
            </span>
          </motion.div>

          {/* The mascot plants the flag. */}
          <motion.img
            src="/brand/mascot/flag.png"
            alt=""
            className="absolute right-20 bottom-0 h-[440px]"
            initial={{ y: 480, rotate: 10 }}
            animate={{ y: [480, 480, 0, 0, 480], rotate: [10, 10, 0, 0, 10] }}
            transition={{ duration: OPENING_S, times: [0, at(0.8), at(1.5), at(3.2), at(3.6)], ease: EASE }}
          />

          {/* The hit: one white burn as zero lands. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-fg"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.95, 0] }}
            transition={{ duration: 1.2, times: [0, 0.2, 1], ease: 'easeOut' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

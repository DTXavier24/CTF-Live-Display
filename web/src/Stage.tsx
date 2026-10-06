import { MotionConfig } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';

const W = 1920;
const H = 1080;
const fit = () => Math.min(innerWidth / W, innerHeight / H);

/** Fixed 1920×1080 canvas, scaled to fit and letterboxed. */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(fit);
  useEffect(() => {
    const onResize = () => setScale(fit());
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);
  return (
    <div className="fixed inset-0 cursor-none overflow-hidden bg-black">
      <div
        className="dots absolute top-1/2 left-1/2 overflow-hidden"
        style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {/* Honour the OS reduced-motion setting for every Motion animation on the display. */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </div>
    </div>
  );
}

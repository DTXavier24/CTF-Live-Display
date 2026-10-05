import { motion, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';

/** Number that springs to its new value instead of jumping. Tabular digits so nothing jitters. */
export function CountUp({ value, from = value, decimals = 0 }: { value: number; from?: number; decimals?: number }) {
  const spring = useSpring(from, { stiffness: 60, damping: 18 });
  const text = useTransform(spring, (v) => v.toFixed(decimals));
  useEffect(() => spring.set(value), [spring, value]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

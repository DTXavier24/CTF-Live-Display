import type { ScoreRow, TemplatePayloads, Top10Board } from '@iboh/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { CountUp } from '../CountUp';
import { EventPlate } from './events';
import type { TemplateProps } from './index';

/** How long the previous order holds before rows move to their new places. */
const SETTLE_MS = 1400;

export function Top10({ item }: TemplateProps<'top10'>) {
  const { boards } = item.payload as TemplatePayloads['top10'];
  const [index, setIndex] = useState(0);
  // Boards alternate (Local, then International) within the item's duration.
  useEffect(() => {
    const per = (item.durationMs ?? 15_000 * boards.length) / boards.length;
    const timers = boards.slice(1).map((_, i) => setTimeout(() => setIndex(i + 1), per * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [item.id, item.durationMs, boards.length]);

  const board = boards[index]!;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={board.division}
        className="flex h-full flex-col"
        initial={{ clipPath: 'inset(0 100% 0 0)' }}
        animate={{ clipPath: 'inset(0 0% 0 0)' }}
        exit={{ clipPath: 'inset(0 0 0 100%)' }}
        transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1] }}
      >
        <Board board={board} />
      </motion.div>
    </AnimatePresence>
  );
}

function Board({ board }: { board: Top10Board }) {
  const [settled, setSettled] = useState(!board.prevRows);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, []);
  const rows = settled ? board.rows : board.prevRows!;
  const prevScore = new Map(board.prevRows?.map((r) => [r.teamId, r.score]));

  return (
    <>
      <div className="mb-4 flex items-end justify-between">
        <div className="flex items-center gap-4">
          <EventPlate tone="plate-cyan" delay={0.1} size="text-5xl">
            Top 10
          </EventPlate>
          <span className="glitch hit font-display text-5xl font-bold uppercase" style={{ animationDelay: '0.25s' }}>
            {board.division}
          </span>
        </div>
        <div className="flex gap-10 pr-6 font-display text-lg font-semibold tracking-[0.1em] text-fg-muted uppercase">
          <span className="w-28 text-right">Score</span>
          <span className="w-16 text-right">Solves</span>
        </div>
      </div>
      <ol className="relative flex flex-1 flex-col gap-1">
        {/* popLayout: teams leaving the top 10 drop out of the flow at once, so rows never overflow. */}
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((r) => (
            <motion.li
              key={r.teamId}
              layout
              initial={{ opacity: 0, x: 120 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -120 }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
              className={`flex h-[58px] items-center gap-5 pr-5 ${r.rank === 1 && settled ? 'bg-cyan/20' : 'bg-bg/70'}`}
            >
              <span
                className={`flex h-full w-16 items-center justify-center font-display text-3xl font-bold tabular-nums ${
                  r.rank === 1 && settled ? 'bg-cyan text-bg' : 'text-cyan'
                }`}
              >
                {r.rank}
              </span>
              <span className="min-w-0 flex-1 truncate font-display text-3xl font-semibold">{r.name}</span>
              {settled && <Movement row={r} board={board} />}
              <span className="w-28 text-right font-display text-3xl tabular-nums">
                <CountUp value={r.score} from={prevScore.get(r.teamId) ?? r.score} />
              </span>
              <span className="w-16 text-right font-display text-2xl text-fg-muted tabular-nums">{r.solvedCount}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </>
  );
}

function Movement({ row, board }: { row: ScoreRow; board: Top10Board }) {
  if (!board.prevRanks) return <span className="w-20" />;
  const before = board.prevRanks[row.teamId];
  const wasTop10 = board.prevRows?.some((p) => p.teamId === row.teamId);
  let content = <span className="text-fg-muted">–</span>;
  if (!wasTop10) content = <span className="plate plate-cyan text-base">New</span>;
  else if (before !== undefined && before > row.rank) content = <Moved up by={before - row.rank} />;
  else if (before !== undefined && before < row.rank) content = <Moved by={row.rank - before} />;
  return (
    <motion.span
      className="w-20 text-right font-display text-2xl tabular-nums"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
    >
      {content}
    </motion.span>
  );
}

/** Places moved: a drawn chevron plus the count, cyan up and red down. */
function Moved({ up = false, by }: { up?: boolean; by: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${up ? 'text-cyan' : 'text-red'}`}>
      <svg viewBox="0 0 16 12" className="h-4 w-5" aria-hidden>
        <path d={up ? 'M8 0 16 12H0Z' : 'M0 0H16L8 12Z'} fill="currentColor" />
      </svg>
      {by}
    </span>
  );
}

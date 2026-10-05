import type { ScoreRow, TemplatePayloads, Top10Board } from '@iboh/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { CountUp } from '../CountUp';
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
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -60 }}
        transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
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
      <div className="mb-5 flex items-baseline justify-between">
        <h3 className="font-display text-5xl font-bold uppercase">
          Top 10 <span className="text-cyan">· {board.division}</span>
        </h3>
        <div className="eyebrow flex gap-10 pr-6 text-fg-muted">
          <span className="w-28 text-right">Score</span>
          <span className="w-16 text-right">Solves</span>
        </div>
      </div>
      <ol className="relative flex flex-1 flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.li
              key={r.teamId}
              layout
              initial={{ opacity: 0, x: 120 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -120 }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
              className={`flex h-[60px] items-center gap-5 px-5 ${r.rank === 1 && settled ? 'bg-cyan/15' : 'bg-bg/60'}`}
            >
              <span className="w-12 font-display text-3xl font-bold text-cyan tabular-nums">{r.rank}</span>
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
  if (!wasTop10) content = <span className="eyebrow text-cyan">New</span>;
  else if (before !== undefined && before > row.rank) content = <span className="text-cyan">▲ {before - row.rank}</span>;
  else if (before !== undefined && before < row.rank) content = <span className="text-red">▼ {row.rank - before}</span>;
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

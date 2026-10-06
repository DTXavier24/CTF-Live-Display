import type { ClientToServerEvents, LoopConfig, LoopEntry, NowPlaying, QueueItem, ServerToClientEvents } from '@iboh/shared';
import type { FastifyBaseLogger } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { z } from 'zod';
import { kv } from './db.js';
import { templateIds, templates, type TemplateContext } from './templates.js';

const LOAD_TIMEOUT_MS = 5000;
/** Cap for items that play until the display says done (videos). */
const MAX_UNTIMED_MS = 10 * 60_000;
const IDLE_RETRY_MS = 5000;

const DEFAULT_LOOP: LoopConfig = {
  enabled: true,
  entries: [
    { template: 'top10' },
    { template: 'sponsor-video' },
    { template: 'unsolved' },
    { template: 'spotlight' },
    { template: 'sponsor-video' },
    { template: 'countdown-end' },
  ],
};

const Template = z.enum(templateIds as [string, ...string[]]);
const Duration = z.number().int().min(1000).max(MAX_UNTIMED_MS);

/** Validate template + its input; throws a ZodError with a readable message. */
function checkInput(template: string, input: unknown) {
  return templates[Template.parse(template) as QueueItem['template']].input.parse(input ?? {});
}

export const QueueAdd = z
  .object({ template: Template, input: z.unknown(), priority: z.enum(['normal', 'high']).optional(), durationMs: Duration.optional() })
  .superRefine((v, ctx) => {
    try { checkInput(v.template, v.input); } catch (err) { ctx.addIssue({ code: 'custom', path: ['input'], message: String(err) }); }
  });

export const LoopUpdate = z.object({
  enabled: z.boolean(),
  entries: z.array(
    z.object({ template: Template, input: z.unknown().optional(), durationMs: Duration.optional() }).superRefine((v, ctx) => {
      try { checkInput(v.template, v.input); } catch (err) { ctx.addIssue({ code: 'custom', path: ['input'], message: String(err) }); }
    }),
  ),
});

const Report = z.object({ id: z.string(), status: z.enum(['ready', 'done', 'error']), error: z.string().max(500).optional() });

interface EngineDeps {
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  log: FastifyBaseLogger;
  context: () => TemplateContext;
  onChange: () => void;
}

export function startEngine({ io, log, context, onChange }: EngineDeps) {
  let queue = kv.get<QueueItem[]>('queue') ?? [];
  let loop = kv.get<LoopConfig & { index: number }>('loop') ?? { ...DEFAULT_LOOP, index: 0 };
  // A queue item cut off by a restart plays again first.
  const interrupted = kv.get<QueueItem | null>('current');
  if (interrupted) queue.unshift(interrupted);

  let current: NowPlaying | null = null;
  /** Displays that failed the current item. It is skipped only once every visible display has failed it. */
  let failedBy = new Set<string>();
  let currentItem: QueueItem | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Display sockets and whether each is visible. */
  const displays = new Map<string, boolean>();
  const watching = () => [...displays.values()].some(Boolean);
  let skips = 0;

  function save() {
    kv.set('queue', queue);
    kv.set('loop', loop);
    kv.set('current', current?.source === 'queue' ? currentItem : null);
  }

  function finish() {
    clearTimeout(timer);
    current = currentItem = null;
    advance();
  }

  function idle() {
    current = currentItem = null;
    save();
    onChange();
    timer = setTimeout(advance, IDLE_RETRY_MS);
  }

  function advance() {
    clearTimeout(timer);
    const ctx = context();
    // Queue plays over pre and live; the loop only during live. Nothing without a display watching.
    const canQueue = watching() && ctx.phase !== 'ended';
    const canLoop = canQueue && ctx.phase === 'live' && loop.enabled && loop.entries.length > 0;

    let item: QueueItem;
    let source: NowPlaying['source'];
    if (canQueue && queue.length) {
      item = queue.shift()!;
      source = 'queue';
    } else if (canLoop) {
      const entry: LoopEntry = loop.entries[loop.index % loop.entries.length]!;
      loop.index = (loop.index + 1) % loop.entries.length;
      item = { id: randomUUID(), template: entry.template, input: entry.input ?? {}, priority: 'normal', durationMs: entry.durationMs, createdAt: ctx.now };
      source = 'loop';
    } else {
      return idle();
    }

    if (play(item, source, ctx)) return;
    // Skipped. If a whole loop cycle skips (e.g. no data yet), wait instead of spinning.
    if (++skips > loop.entries.length + 1) {
      skips = 0;
      return idle();
    }
    advance();
  }

  function play(item: QueueItem, source: NowPlaying['source'], ctx: TemplateContext): boolean {
    const def = templates[item.template];
    let payload;
    try {
      payload = def?.resolve(def.input.parse(item.input ?? {}), ctx);
    } catch (err) {
      log.warn({ err, template: item.template }, 'queue item failed to resolve, skipped');
      return false;
    }
    if (!payload) {
      log.info({ template: item.template }, 'queue item has nothing to show, skipped');
      return false;
    }
    const durationMs = item.durationMs ?? (typeof def.durationMs === 'function' ? (def.durationMs as (p: unknown) => number | null)(payload) : def.durationMs);
    current = { id: randomUUID(), template: item.template, payload, durationMs, status: 'loading', startedAt: null, source } as NowPlaying;
    failedBy = new Set();
    currentItem = item;
    skips = 0;
    save();
    onChange();
    timer = setTimeout(() => {
      log.warn({ template: item.template }, 'display did not report ready in time, skipped');
      finish();
    }, LOAD_TIMEOUT_MS);
    return true;
  }

  function onReport(raw: unknown, displayId: string) {
    const r = Report.safeParse(raw);
    if (!r.success || !current || r.data.id !== current.id) return;
    const { status, error } = r.data;
    if (status === 'ready' && current.status === 'loading') {
      clearTimeout(timer);
      current.status = 'playing';
      current.startedAt = Date.now();
      timer = setTimeout(finish, current.durationMs ?? MAX_UNTIMED_MS);
      onChange();
    } else if (status === 'done' && current.status === 'playing') {
      finish();
    } else if (status === 'error') {
      failedBy.add(displayId);
      const visible = [...displays].filter(([, v]) => v).map(([id]) => id);
      // One broken or outdated screen must not cut the item for the others.
      if (visible.every((id) => failedBy.has(id))) {
        log.warn({ template: current.template, error }, 'every display reported an error, skipped');
        finish();
      } else {
        log.warn({ template: current.template, error, displayId }, 'one display failed the item; others continue');
      }
    }
  }

  io.on('connection', (socket) => {
    if (socket.handshake.auth?.role !== 'display') return;
    const who = { address: socket.handshake.address, ua: socket.handshake.headers['user-agent'] };
    displays.set(socket.id, socket.handshake.auth?.visible !== false);
    log.info({ ...who, visible: displays.get(socket.id), displays: displays.size }, 'display connected');
    socket.on('report', (r) => onReport(r, socket.id));
    socket.on('visibility', (visible) => {
      displays.set(socket.id, visible === true);
      if (visible === true && !current) advance();
    });
    socket.on('disconnect', () => {
      displays.delete(socket.id);
      log.info({ ...who, displays: displays.size }, 'display disconnected');
    });
    if (!current) advance();
  });

  advance();

  return {
    now: () => current,
    snapshot: () => ({ now: current, queue, loop, displays: displays.size, visibleDisplays: [...displays.values()].filter(Boolean).length }),
    add(body: z.infer<typeof QueueAdd>): QueueItem {
      const item: QueueItem = {
        id: randomUUID(),
        template: body.template as QueueItem['template'],
        input: checkInput(body.template, body.input),
        priority: body.priority ?? templates[body.template as QueueItem['template']].priority,
        durationMs: body.durationMs,
        createdAt: Date.now(),
      };
      // High jumps ahead of every normal item but stays FIFO among highs. It never interrupts.
      const at = item.priority === 'high' ? queue.findIndex((q) => q.priority !== 'high') : -1;
      if (at === -1) queue.push(item);
      else queue.splice(at, 0, item);
      save();
      if (!current) advance();
      return item;
    },
    remove(id: string) {
      const before = queue.length;
      queue = queue.filter((q) => q.id !== id);
      save();
      return queue.length < before;
    },
    skip() {
      if (current) finish();
    },
    setLoop(cfg: z.infer<typeof LoopUpdate>) {
      loop = { enabled: cfg.enabled, entries: cfg.entries as LoopEntry[], index: 0 };
      save();
      if (!current) advance();
    },
  };
}

export type Engine = ReturnType<typeof startEngine>;

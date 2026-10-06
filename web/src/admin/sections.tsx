import type { AutoConfig, AutoEventKind, AutoTemplate, LoopEntry, NowPlaying, PhaseOverride, QueueItem, TemplateId, TemplatePayloads } from '@iboh/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fmtClock, fmtDuration, serverNow, useNow } from '../server';
import { templateComponents } from '../templates';
import { api, upload } from './api';
import type { PanelProps } from './Admin';

// ---------- Template metadata for the forms ----------

interface Field {
  name: string;
  label: string;
  kind: 'text' | 'textarea' | 'video';
  max?: number;
}

const TEMPLATES: Record<TemplateId, { label: string; manual: boolean; fields?: Field[] }> = {
  announcement: {
    label: 'Announcement',
    manual: true,
    fields: [
      { name: 'title', label: 'Title', kind: 'text', max: 80 },
      { name: 'body', label: 'Body (optional)', kind: 'textarea', max: 400 },
    ],
  },
  'sponsor-video': { label: 'Sponsor video', manual: true, fields: [{ name: 'file', label: 'Video', kind: 'video' }] },
  top10: { label: 'Top 10 scoreboard', manual: true },
  unsolved: { label: 'Unsolved challenges', manual: true },
  spotlight: { label: 'Team spotlight', manual: true },
  'countdown-end': { label: 'Countdown to end', manual: true },
  'countdown-start': { label: 'Countdown to start', manual: true },
  idle: { label: 'Idle (logo only)', manual: true },
  // Auto-events: detected by the server, never added by hand.
  blood: { label: 'Blood', manual: false },
  takeover: { label: 'Takeover', manual: false },
  'wall-falls': { label: 'The Wall Falls', manual: false },
  'on-fire': { label: 'On Fire', manual: false },
  milestone: { label: 'Milestone', manual: false },
};
const MANUAL = (Object.keys(TEMPLATES) as TemplateId[]).filter((t) => TEMPLATES[t].manual);
const label = (t: TemplateId) => TEMPLATES[t]?.label ?? t;

/** One-line description of a queued item, so the operator knows which announcement is which. */
function describe(template: TemplateId, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  if (template === 'announcement') return String(i.title ?? '');
  if (template === 'sponsor-video') return String(i.file ?? 'next in rotation');
  if (template === 'blood') return `${i.team} · ${i.challenge} (${i.division})`;
  if (template === 'takeover') return `${(i.leader as { name?: string })?.name} takes #1 (${i.division})`;
  if (template === 'wall-falls') return `${i.challenge} by ${i.team}`;
  if (template === 'on-fire') return `${i.team} · ${i.count} in a row`;
  if (template === 'milestone') return `${i.milestone} flags`;
  return '';
}

// ---------- Small building blocks ----------

function Card({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="eyebrow text-cyan">{title}</h2>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="accent-cyan" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function NumberField({ label: text, value, onChange, step = 1, min = 0, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string }) {
  return (
    <label className="field">
      <span>
        {text}
        {suffix && <em className="ml-1 text-fg-muted not-italic">({suffix})</em>}
      </span>
      <input type="number" value={value} min={min} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

const seconds = (ms: number | null | undefined) => (ms ? String(Math.round(ms / 1000)) : '');

// ---------- Preview ----------

/** Live mirror of /display. `?preview=1` joins as a viewer, so it never drives the engine. */
export function Preview() {
  return (
    <Card title="Display preview">
      <div className="relative aspect-video w-full overflow-hidden border border-hair bg-black">
        <iframe title="Display preview" src="/display?preview=1" className="absolute inset-0 h-full w-full" />
      </div>
    </Card>
  );
}

// ---------- Now playing ----------

export function NowPlayingCard({ state, run }: PanelProps) {
  const now = useNow(250);
  const item = state.now;
  const remaining = item?.durationMs && item.startedAt ? item.durationMs - (now - item.startedAt) : null;
  return (
    <Card
      title="Now playing"
      actions={
        <button className="btn btn-red" disabled={!item} onClick={() => run(() => api('POST', '/api/admin/skip'), 'Skipped')}>
          Skip now
        </button>
      }
    >
      {item ? (
        <div>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-display text-2xl font-bold">{label(item.template)}</span>
            <span className="chip chip-muted">{item.source === 'loop' ? 'Loop' : 'Queue'}</span>
            {item.status === 'loading' && <span className="chip chip-warn">Loading…</span>}
            <span className="ml-auto font-display text-2xl tabular-nums">
              {remaining !== null ? fmtDuration(remaining) : item.status === 'playing' ? 'until video ends' : ''}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-fg-muted">{describe(item.template, item.payload)}</p>
          {remaining !== null && item.durationMs && (
            <div className="mt-3 h-1.5 bg-hair">
              <div className="h-full bg-cyan" style={{ width: `${Math.max(0, Math.min(100, 100 - (remaining / item.durationMs) * 100))}%` }} />
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-fg-muted">
          Nothing playing. {state.displays.some((d) => d.visible) ? 'Queue is empty and the loop is off or has nothing to show.' : 'No display is connected; the queue is on hold.'}
        </p>
      )}
    </Card>
  );
}

// ---------- Queue ----------

export function QueuePanel({ state, run }: PanelProps) {
  const [order, setOrder] = useState<QueueItem[] | null>(null);
  const dragFrom = useRef<number | null>(null);
  const items = order ?? state.queue;

  function drop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to) return setOrder(null);
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    setOrder(next); // optimistic, until the next poll confirms
    void run(() => api('PUT', '/api/admin/queue/order', { ids: next.map((q) => q.id) })).finally(() => setOrder(null));
  }

  return (
    <Card title={`Queue · ${state.queue.length}`}>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">Empty. The default loop plays when the queue is empty.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {items.map((q, i) => (
            <li
              key={q.id}
              draggable
              onDragStart={() => (dragFrom.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(i)}
              className="flex cursor-grab items-center gap-3 bg-bg/70 px-3 py-2 text-sm active:cursor-grabbing"
            >
              <span aria-hidden className="text-fg-muted">⋮⋮</span>
              <span className="w-5 text-right text-fg-muted tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{label(q.template)}</div>
                <div className="truncate text-xs text-fg-muted">{describe(q.template, q.input)}</div>
              </div>
              <select
                aria-label="Priority"
                className="input w-24"
                value={q.priority}
                onChange={(e) => run(() => api('PATCH', `/api/admin/queue/${q.id}`, { priority: e.target.value }))}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
              <input
                aria-label="Duration in seconds"
                className="input w-20"
                type="number"
                min={1}
                placeholder="auto"
                defaultValue={seconds(q.durationMs)}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== seconds(q.durationMs)) void run(() => api('PATCH', `/api/admin/queue/${q.id}`, { durationMs: v ? Number(v) * 1000 : null }));
                }}
              />
              <span className="text-xs text-fg-muted">s</span>
              <button className="btn btn-ghost px-2" aria-label="Remove" onClick={() => run(() => api('DELETE', `/api/admin/queue/${q.id}`), 'Removed')}>
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      {items.length > 1 && <p className="mt-2 text-xs text-fg-muted">Drag to reorder. High priority items jump ahead of normal ones but never interrupt what is playing.</p>}
    </Card>
  );
}

// ---------- Add from template ----------

export function AddFromTemplate({ state, run }: PanelProps) {
  const [template, setTemplate] = useState<TemplateId>('announcement');
  const [input, setInput] = useState<Record<string, string>>({});
  const [priority, setPriority] = useState<'default' | 'normal' | 'high'>('default');
  const [duration, setDuration] = useState('');
  const fields = TEMPLATES[template].fields ?? [];
  const missing = template === 'announcement' && !input.title?.trim();

  async function add() {
    const body: Record<string, unknown> = { template, input: Object.fromEntries(Object.entries(input).filter(([, v]) => v !== '')) };
    if (priority !== 'default') body.priority = priority;
    if (duration) body.durationMs = Number(duration) * 1000;
    if (await run(() => api('POST', '/api/admin/queue', body), `${label(template)} added to the queue`)) {
      setInput({});
      setDuration('');
    }
  }

  return (
    <Card title="Add from template">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <label className="field">
            <span>Template</span>
            <select
              className="input"
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value as TemplateId);
                setInput({});
              }}
            >
              {MANUAL.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </label>
          {fields.map((f) => (
            <label key={f.name} className="field">
              <span>
                {f.label}
                {f.max && <em className="ml-1 text-fg-muted not-italic">{(input[f.name] ?? '').length}/{f.max}</em>}
              </span>
              {f.kind === 'textarea' ? (
                <textarea className="input min-h-24" maxLength={f.max} value={input[f.name] ?? ''} onChange={(e) => setInput({ ...input, [f.name]: e.target.value })} />
              ) : f.kind === 'video' ? (
                <select className="input" value={input[f.name] ?? ''} onChange={(e) => setInput({ ...input, [f.name]: e.target.value })}>
                  <option value="">Next in rotation</option>
                  {state.media.videos.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              ) : (
                <input className="input" maxLength={f.max} value={input[f.name] ?? ''} onChange={(e) => setInput({ ...input, [f.name]: e.target.value })} />
              )}
            </label>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span>Priority</span>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                <option value="default">Template default</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="field">
              <span>Duration (s)</span>
              <input className="input" type="number" min={1} placeholder="default" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </label>
          </div>
          <button className="btn btn-primary" disabled={missing} onClick={add}>
            Add to queue
          </button>
        </div>
        <TemplatePreview template={template} input={input} state={state} />
      </div>
    </Card>
  );
}

/** What the item will look like, rendered with the real component at display scale. */
function TemplatePreview({ template, input, state }: { template: TemplateId; input: Record<string, string>; state: PanelProps['state'] }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1040));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let payload: unknown = null;
  if (template === 'announcement') payload = { title: input.title || 'Your title here', body: input.body ?? '' } satisfies TemplatePayloads['announcement'];
  if (template === 'countdown-end' && state.game) payload = { target: state.game.end, label: 'Time remaining' };
  if (template === 'countdown-start' && state.game) payload = { target: state.game.start, label: 'CTF starts in' };
  if (template === 'idle') payload = {};
  if (template === 'sponsor-video') {
    const file = input.file || state.media.videos[0];
    payload = file ? { url: `/media/videos/${encodeURIComponent(file)}` } : null;
  }
  const entry = templateComponents[template];
  const item = { id: 'preview', template, payload, durationMs: 15_000, status: 'playing', startedAt: serverNow(), source: 'queue' } as NowPlaying;
  const noop = () => {};

  return (
    <div>
      <p className="eyebrow mb-2 text-fg-muted">Preview{entry.fullscreen ? ' · full screen' : ' · center panel'}</p>
      <div ref={box} className="relative w-full overflow-hidden border border-hair bg-bg-2" style={{ aspectRatio: '1040 / 728' }}>
        {payload ? (
          <div className="absolute top-0 left-0 origin-top-left" style={{ width: 1040, height: 728, transform: `scale(${scale})` }}>
            <entry.component item={item} ready={noop} done={noop} fail={noop} />
          </div>
        ) : (
          <p className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-muted">
            {template === 'sponsor-video' ? 'Upload a video first.' : 'Built from live data at the moment it plays.'}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- Default loop ----------

export function LoopEditor({ state, run }: PanelProps) {
  const [draft, setDraft] = useState<{ enabled: boolean; entries: LoopEntry[] } | null>(null);
  const loop = draft ?? state.loop;
  const dragFrom = useRef<number | null>(null);
  const edit = (next: Partial<typeof loop>) => setDraft({ ...loop, ...next });
  const setEntry = (i: number, patch: Partial<LoopEntry>) => edit({ entries: loop.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  function drop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to) return;
    const entries = [...loop.entries];
    entries.splice(to, 0, entries.splice(from, 1)[0]!);
    edit({ entries });
  }

  return (
    <Card
      title="Default loop"
      actions={
        draft && (
          <>
            <button className="btn btn-ghost" onClick={() => setDraft(null)}>
              Discard
            </button>
            <button className="btn btn-primary" onClick={() => run(() => api('PUT', '/api/admin/loop', draft), 'Loop saved').then((ok) => ok && setDraft(null))}>
              Save loop
            </button>
          </>
        )
      }
    >
      <Toggle checked={loop.enabled} onChange={(enabled) => edit({ enabled })}>
        Play the loop whenever the queue is empty (live phase only)
      </Toggle>
      <ol className="mt-3 flex flex-col gap-1.5">
        {loop.entries.map((e, i) => (
          <li key={i} draggable onDragStart={() => (dragFrom.current = i)} onDragOver={(ev) => ev.preventDefault()} onDrop={() => drop(i)} className="flex cursor-grab items-center gap-2 bg-bg/70 px-3 py-2 text-sm">
            <span aria-hidden className="text-fg-muted">⋮⋮</span>
            <select aria-label="Template" className="input min-w-0 flex-1" value={e.template} onChange={(ev) => setEntry(i, { template: ev.target.value as TemplateId, input: undefined })}>
              {MANUAL.filter((t) => t !== 'announcement').map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
            {e.template === 'sponsor-video' && (
              <select aria-label="Video" className="input w-40" value={(e.input as { file?: string })?.file ?? ''} onChange={(ev) => setEntry(i, { input: ev.target.value ? { file: ev.target.value } : undefined })}>
                <option value="">Rotate</option>
                {state.media.videos.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            )}
            <input aria-label="Duration in seconds" className="input w-20" type="number" min={1} placeholder="auto" value={seconds(e.durationMs)} onChange={(ev) => setEntry(i, { durationMs: ev.target.value ? Number(ev.target.value) * 1000 : undefined })} />
            <span className="text-xs text-fg-muted">s</span>
            <button className="btn btn-ghost px-2" aria-label="Remove" onClick={() => edit({ entries: loop.entries.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </li>
        ))}
      </ol>
      <button className="btn btn-ghost mt-3" onClick={() => edit({ entries: [...loop.entries, { template: 'top10' }] })}>
        + Add entry
      </button>
      {draft && <p className="mt-2 text-xs text-red">Unsaved changes.</p>}
    </Card>
  );
}

// ---------- Auto-events ----------

export function AutoEvents({ state, run }: PanelProps) {
  const [draft, setDraft] = useState<AutoConfig | null>(null);
  const [milestones, setMilestones] = useState<string | null>(null);
  const c = draft ?? state.autoConfig;
  const set = (next: Partial<AutoConfig>) => setDraft({ ...c, ...next });

  async function save() {
    const list = (milestones ?? c.milestone.list.join(', '))
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (list.some((n) => !Number.isInteger(n) || n <= 0)) return run(() => Promise.reject(new Error('Milestones must be positive whole numbers, separated by commas.')));
    const ok = await run(() => api('PUT', '/api/admin/auto-events', { ...c, milestone: { ...c.milestone, list } }), 'Auto-events saved');
    if (ok) {
      setDraft(null);
      setMilestones(null);
    }
  }

  const dirty = draft !== null || milestones !== null;
  return (
    <Card title="Auto-events" actions={dirty && <button className="btn btn-primary" onClick={save}>Save</button>}>
      <div className="flex flex-col gap-4">
        <Toggle checked={c.bloods} onChange={(bloods) => set({ bloods })}>
          Bloods (1st/2nd/3rd per division)
        </Toggle>
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <Toggle checked={c.takeover.enabled} onChange={(enabled) => set({ takeover: { ...c.takeover, enabled } })}>Takeover</Toggle>
          <NumberField label="Cooldown per division" suffix="min" value={c.takeover.cooldownMin} onChange={(cooldownMin) => set({ takeover: { ...c.takeover, cooldownMin } })} />
          <Toggle checked={c.wallFalls.enabled} onChange={(enabled) => set({ wallFalls: { ...c.wallFalls, enabled } })}>The Wall Falls</Toggle>
          <NumberField label="Unsolved for at least" suffix="hours" step={0.5} value={c.wallFalls.hours} onChange={(hours) => set({ wallFalls: { ...c.wallFalls, hours } })} />
        </div>
        <div>
          <Toggle checked={c.onFire.enabled} onChange={(enabled) => set({ onFire: { ...c.onFire, enabled } })}>On Fire</Toggle>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <NumberField label="Solves" min={2} value={c.onFire.count} onChange={(count) => set({ onFire: { ...c.onFire, count } })} />
            <NumberField label="Within" suffix="min" value={c.onFire.windowMin} onChange={(windowMin) => set({ onFire: { ...c.onFire, windowMin } })} />
            <NumberField label="Cooldown per team" suffix="min" value={c.onFire.cooldownMin} onChange={(cooldownMin) => set({ onFire: { ...c.onFire, cooldownMin } })} />
          </div>
        </div>
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <Toggle checked={c.milestone.enabled} onChange={(enabled) => set({ milestone: { ...c.milestone, enabled } })}>Milestone</Toggle>
          <label className="field">
            <span>Total solves</span>
            <input className="input" value={milestones ?? c.milestone.list.join(', ')} onChange={(e) => setMilestones(e.target.value)} />
          </label>
        </div>
        <NumberField label="Skip auto-events older than" suffix="min" value={c.staleMin} onChange={(staleMin) => set({ staleMin })} />
        <div>
          <p className="mb-2 text-sm">Card duration on screen (seconds)</p>
          <div className="grid grid-cols-5 gap-3">
            {(['blood', 'takeover', 'wall-falls', 'on-fire', 'milestone'] as AutoTemplate[]).map((t) => (
              <NumberField key={t} label={label(t)} min={3} value={c.durations[t]} onChange={(v) => set({ durations: { ...c.durations, [t]: v } })} />
            ))}
          </div>
        </div>
        {dirty && <p className="text-xs text-red">Unsaved changes.</p>}
      </div>
    </Card>
  );
}

// ---------- Phase ----------

export function PhaseControl({ state, run }: PanelProps) {
  const options: PhaseOverride[] = ['auto', 'pre', 'live', 'ended'];
  const names: Record<PhaseOverride, string> = { auto: 'Auto', pre: 'Pre-CTF', live: 'Live', ended: 'Ended' };
  function choose(phaseOverride: PhaseOverride) {
    if (phaseOverride === state.phaseOverride) return;
    if (phaseOverride !== 'auto' && !confirm(`Force the display into "${names[phaseOverride]}"? It stays there until you switch back to Auto.`)) return;
    void run(() => api('PUT', '/api/admin/settings', { phaseOverride }), `Phase: ${names[phaseOverride]}`);
  }
  return (
    <Card title="Phase">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Phase override">
        {options.map((o) => (
          <button key={o} role="radio" aria-checked={state.phaseOverride === o} className={`btn ${state.phaseOverride === o ? 'btn-primary' : 'btn-ghost'}`} onClick={() => choose(o)}>
            {names[o]}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-fg-muted">
        Showing <strong className="text-fg">{names[state.phase]}</strong>
        {state.phaseOverride === 'auto' ? ' (from the game clock)' : ' (manual override)'}.
        {state.game && (
          <>
            {' '}Game runs {fmtClock(state.game.start)} → {fmtClock(state.game.end)} GMT+8.
          </>
        )}
      </p>
    </Card>
  );
}

// ---------- Settings: venue and media ----------

export function Venue({ state, run }: PanelProps) {
  const [venue, setVenue] = useState<string | null>(null);
  const value = venue ?? state.venue;
  return (
    <Card title="Closing statement">
      <label className="field">
        <span>Venue</span>
        <div className="flex gap-2">
          <input className="input flex-1" maxLength={120} value={value} onChange={(e) => setVenue(e.target.value)} />
          <button className="btn btn-primary" disabled={venue === null || !value.trim()} onClick={() => run(() => api('PUT', '/api/admin/settings', { venue: value }), 'Venue saved').then((ok) => ok && setVenue(null))}>
            Save
          </button>
        </div>
      </label>
      <p className="mt-2 text-sm text-fg-muted">“IBOH 2026 has officially ended. Please proceed to {value || '…'}.”</p>
    </Card>
  );
}

export function MediaLibrary({ state, run }: PanelProps) {
  return (
    <Card title="Media">
      <div className="grid gap-5 md:grid-cols-2">
        <MediaList kind="videos" title="Sponsor videos" accept="video/mp4,video/webm" hint="MP4 or WebM, up to 500 MB. Played muted." files={state.media.videos} run={run} />
        <MediaList kind="logos" title="Sponsor logos (ticker)" accept="image/png,image/jpeg,image/webp,image/gif" hint="PNG, JPG, WebP or GIF, up to 5 MB." files={state.media.logos} run={run} />
      </div>
    </Card>
  );
}

function MediaList({ kind, title, accept, hint, files, run }: { kind: 'videos' | 'logos'; title: string; accept: string; hint: string; files: string[]; run: PanelProps['run'] }) {
  const [progress, setProgress] = useState<{ name: string; fraction: number } | null>(null);
  async function onFiles(list: FileList | null) {
    for (const file of Array.from(list ?? [])) {
      setProgress({ name: file.name, fraction: 0 });
      await run(() => upload(kind, file, (fraction) => setProgress({ name: file.name, fraction })), `Uploaded ${file.name}`);
    }
    setProgress(null);
  }
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <ul className="flex flex-col gap-1">
        {files.map((f) => (
          <li key={f} className="flex items-center gap-2 bg-bg/70 px-3 py-1.5 text-sm">
            {kind === 'logos' && <img src={`/media/logos/${encodeURIComponent(f)}`} alt="" className="h-6 w-10 object-contain" />}
            <span className="min-w-0 flex-1 truncate">{f}</span>
            <button className="btn btn-ghost px-2" aria-label={`Delete ${f}`} onClick={() => confirm(`Delete ${f}?`) && run(() => api('DELETE', `/api/admin/media/${kind}/${encodeURIComponent(f)}`), 'Deleted')}>
              ✕
            </button>
          </li>
        ))}
        {files.length === 0 && <li className="text-sm text-fg-muted">None yet.</li>}
      </ul>
      {progress ? (
        <div className="mt-2 text-xs text-fg-muted">
          Uploading {progress.name}… {Math.round(progress.fraction * 100)}%
          <div className="mt-1 h-1 bg-hair">
            <div className="h-full bg-cyan" style={{ width: `${progress.fraction * 100}%` }} />
          </div>
        </div>
      ) : (
        <label className="btn btn-ghost mt-2 cursor-pointer">
          Upload…
          <input type="file" multiple accept={accept} className="sr-only" onChange={(e) => void onFiles(e.target.files).then(() => (e.target.value = ''))} />
        </label>
      )}
      <p className="mt-1 text-xs text-fg-muted">{hint}</p>
    </div>
  );
}

// ---------- Health ----------

export function Health({ state }: PanelProps) {
  const now = useNow(1000);
  const h = state.health;
  const hubOk = h.hub === 'Connected' || h.hub === 'n/a';
  const age = h.lastFetchOk ? Math.round((now - h.lastFetchOk) / 1000) : null;
  const fetchOk = age !== null && age < 30;
  const visible = state.displays.filter((d) => d.visible).length;
  return (
    <Card title="Health">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="eyebrow text-fg-muted">Live channel</p>
          <span className={`chip ${hubOk ? 'chip-ok' : 'chip-warn'}`}>{h.source === 'mock' ? 'Mock data' : `Hub: ${h.hub}`}</span>
        </div>
        <div>
          <p className="eyebrow text-fg-muted">Scoreboard poll</p>
          <span className={`chip ${fetchOk ? 'chip-ok' : 'chip-bad'}`}>{age === null ? 'Never succeeded' : `${age}s ago`}</span>
          {h.lastFetchError && <p className="mt-1 text-xs break-words text-red">{h.lastFetchError}</p>}
        </div>
        <div>
          <p className="eyebrow text-fg-muted">Displays</p>
          <span className={`chip ${visible ? 'chip-ok' : 'chip-bad'}`}>
            {visible} visible{state.displays.length > visible && ` · ${state.displays.length - visible} hidden`}
          </span>
        </div>
      </div>
      {state.displays.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-fg-muted">
          {state.displays.map((d) => (
            <li key={d.id} className="truncate">
              <span className={d.visible ? 'text-cyan' : 'text-red'}>●</span> {d.address} · since {fmtClock(d.connectedAt)} · {d.ua.replace(/^Mozilla\/5\.0 /, '').slice(0, 70)}
            </li>
          ))}
        </ul>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm">Recent warnings and errors ({h.errors.length})</summary>
        <ul className="mt-2 max-h-56 overflow-auto font-mono text-xs">
          {h.errors.map((e, i) => (
            <li key={i} className={e.level === 'error' ? 'text-red' : 'text-fg-muted'}>
              {fmtClock(e.time)} {e.msg}
            </li>
          ))}
          {h.errors.length === 0 && <li className="text-fg-muted">Nothing logged.</li>}
        </ul>
      </details>
    </Card>
  );
}

// ---------- Mock rehearsal ----------

export function MockTriggers({ run }: PanelProps) {
  const [last, setLast] = useState('');
  const kinds: [AutoEventKind | 'blood', string][] = [
    ['blood', 'Blood'],
    ['takeover', 'Takeover'],
    ['wall-falls', 'Wall Falls'],
    ['on-fire', 'On Fire'],
    ['milestone', 'Milestone'],
  ];
  return (
    <Card title="Rehearsal (mock only)">
      <div className="flex flex-wrap gap-2">
        {kinds.map(([kind, text]) => (
          <button key={kind} className="btn btn-ghost" onClick={() => run(async () => setLast((await api<{ result: string }>('POST', '/api/admin/mock/trigger', { kind })).result))}>
            {text}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-fg-muted">{last || 'Creates the real condition in the mock data; thresholds and cooldowns are skipped once.'}</p>
    </Card>
  );
}

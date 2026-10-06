import type { AdminState } from '@iboh/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, Unauthorized } from './api';
import {
  AddFromTemplate,
  AutoEvents,
  Health,
  LoopEditor,
  MediaLibrary,
  MockTriggers,
  NowPlayingCard,
  PhaseControl,
  Preview,
  QueuePanel,
  Venue,
} from './sections';

/** Shared by every panel: latest server state, a way to refresh it now, and a toast for errors. */
export interface PanelProps {
  state: AdminState;
  refresh: () => void;
  run: (action: () => Promise<unknown>, done?: string) => Promise<boolean>;
}

export function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [state, setState] = useState<AdminState | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api<AdminState>('GET', '/api/admin/state'));
      setAuthed(true);
    } catch (err) {
      if (err instanceof Unauthorized) setAuthed(false);
    }
  }, []);

  // Live view of the engine: poll once a second while logged in.
  useEffect(() => {
    void refresh();
    const id = setInterval(() => authed !== false && void refresh(), 1000);
    return () => clearInterval(id);
  }, [refresh, authed]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const run = useCallback(
    async (action: () => Promise<unknown>, done?: string) => {
      try {
        await action();
        if (done) setToast({ text: done, error: false });
        void refresh();
        return true;
      } catch (err) {
        if (err instanceof Unauthorized) setAuthed(false);
        else setToast({ text: err instanceof Error ? err.message : String(err), error: true });
        return false;
      }
    },
    [refresh],
  );

  if (authed === false) return <Login onLogin={() => void refresh()} />;
  if (!state) return <div className="admin min-h-screen" />;

  const props: PanelProps = { state, refresh: () => void refresh(), run };
  return (
    <div className="admin min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-hair bg-bg/95 px-6 py-3 backdrop-blur">
        <img src="/brand/logo.png" alt="" className="h-8" />
        <h1 className="font-display text-xl font-bold">IBOH 2026 · Live Display Control</h1>
        <span className={`chip ${state.phase === 'live' ? 'chip-ok' : 'chip-muted'}`}>
          {state.phase.toUpperCase()}
          {state.phaseOverride !== 'auto' && ' (override)'}
        </span>
        {state.health.source === 'mock' && <span className="chip chip-warn">MOCK DATA</span>}
        <a href="/display" target="_blank" rel="noreferrer" className="btn btn-ghost ml-auto">
          Open display ↗
        </a>
        <button className="btn btn-ghost" onClick={() => run(() => api('POST', '/api/admin/logout')).then(() => setAuthed(false))}>
          Log out
        </button>
      </header>

      <main className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Preview />
          <NowPlayingCard {...props} />
          <QueuePanel {...props} />
          <AddFromTemplate {...props} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Health {...props} />
          <PhaseControl {...props} />
          <LoopEditor {...props} />
          <AutoEvents {...props} />
          <Venue {...props} />
          <MediaLibrary {...props} />
          {state.health.source === 'mock' && <MockTriggers {...props} />}
        </div>
      </main>

      {toast && (
        <div role="status" className={`fixed right-5 bottom-5 z-20 max-w-md px-4 py-3 text-sm shadow-lg ${toast.error ? 'bg-red text-bg' : 'bg-cyan text-bg'}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('POST', '/api/admin/login', { password });
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin dots flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <img src="/brand/logo_with_text.png" alt="IBOH 2026" className="mb-6 h-16" />
        <label className="field">
          <span>Admin password</span>
          <input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red">
            {error}
          </p>
        )}
        <button className="btn btn-primary mt-5 w-full" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}

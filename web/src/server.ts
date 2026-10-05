import type { DisplayState, ServerToClientEvents } from '@iboh/shared';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

// One socket per page. Socket.IO reconnects forever with exponential backoff by default.
const socket: Socket<ServerToClientEvents> = io();

let clockOffset = 0;
let lastState: DisplayState | null = null;
socket.on('state', (s) => {
  clockOffset = s.serverTime - Date.now();
  lastState = s;
});

/** The backend clock, so every screen counts down in sync with the server. */
export const serverNow = () => Date.now() + clockOffset;

/** Last state from the server. Kept while disconnected: stale over blank. */
export function useServerState() {
  const [state, setState] = useState(lastState);
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    // Events may have fired between first render and this effect.
    setState(lastState);
    setConnected(socket.connected);
    socket.on('state', setState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('state', setState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);
  return { state, connected };
}

export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuala_Lumpur',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
/** Venue time (GMT+8), regardless of the browser's timezone. */
export const fmtClock = (t: number) => clockFmt.format(t);

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

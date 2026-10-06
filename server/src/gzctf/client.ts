import { HttpTransportType, HubConnectionBuilder, LogLevel, type ILogger } from '@microsoft/signalr';
import type { Scoreboard, Solve } from '@iboh/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';
import { adaptGame, adaptScoreboard, adaptSubmission, RawGame, RawScoreboard, RawSubmission } from './adapter.js';
import type { GzctfSource } from './source.js';

export interface GzctfConfig {
  baseUrl: string;
  gameId: number;
  username: string;
  password: string;
}

const TIMEOUT_MS = 8000;

/** The only GZCTF client: logs in as admin (monitor role), REST for data, monitor hub for live solves. */
export function createGzctfClient(cfg: GzctfConfig, log: FastifyBaseLogger): GzctfSource {
  // Mutated in place on re-login: SignalR keeps a reference to this object for every reconnect.
  const headers: Record<string, string> = {};
  let loggingIn: Promise<void> | null = null;
  let lastBoard: Scoreboard = { entries: [], challenges: [], solves: [] };
  const warned = new Set<string>();
  const warnOnce = (msg: string) => {
    if (!warned.has(msg)) log.warn(msg);
    warned.add(msg);
  };

  async function login() {
    const res = await fetch(`${cfg.baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userName: cfg.username, password: cfg.password }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`GZCTF login failed: HTTP ${res.status}`);
    // GZCTF sets some cookies twice (clear, then set): keep the last non-empty value of each.
    const jar = new Map<string, string>();
    for (const c of res.headers.getSetCookie()) {
      const [pair = ''] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    headers.Cookie = [...jar].filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');
    log.info('GZCTF login ok');
  }

  /** One login at a time, however many requests hit a 401 together. */
  const ensureLogin = () => (loggingIn ??= login().finally(() => (loggingIn = null)));

  async function get<T extends z.ZodTypeAny>(path: string, schema: T): Promise<z.infer<T>> {
    if (!headers.Cookie) await ensureLogin();
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(cfg.baseUrl + path, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if ((res.status === 401 || res.status === 403) && attempt === 0) {
        await ensureLogin();
        continue;
      }
      if (!res.ok) throw new Error(`GZCTF GET ${path}: HTTP ${res.status}`);
      return schema.parse(await res.json());
    }
  }

  const hubLog: ILogger = {
    log(level, message) {
      if (level >= LogLevel.Warning) log.warn(`GZCTF hub: ${message}`);
    },
  };
  const hub = new HubConnectionBuilder()
    .withUrl(`${cfg.baseUrl}/hub/monitor?game=${cfg.gameId}`, { headers, skipNegotiation: true, transport: HttpTransportType.WebSockets })
    .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => Math.min(30_000, 1000 * 2 ** ctx.previousRetryCount) })
    .configureLogging(hubLog)
    .build();

  const listeners: ((s: Solve) => void)[] = [];
  hub.on('ReceivedSubmissions', (payload: unknown) => {
    const parsed = RawSubmission.safeParse(payload);
    if (!parsed.success) return warnOnce(`GZCTF hub: unexpected submission shape: ${parsed.error.message}`);
    const solve = adaptSubmission(parsed.data, lastBoard);
    if (solve) listeners.forEach((cb) => cb(solve));
  });
  // Game events (notices, container events) aren't used; handled so SignalR doesn't warn on each one.
  hub.on('ReceivedGameEvent', () => {});
  hub.onreconnecting(() => {
    log.warn('GZCTF hub disconnected; scoreboard polling covers solves until it reconnects');
    // The session cookie may be what expired: refresh it before the next attempt.
    ensureLogin().catch((err) => log.warn({ err }, 'GZCTF re-login failed'));
  });
  hub.onreconnected(() => log.info('GZCTF hub reconnected'));
  // Fires when the first connect fails or reconnects run out: keep retrying forever.
  hub.onclose(() => setTimeout(startHub, 10_000));

  async function startHub() {
    try {
      await ensureLogin();
      await hub.start();
      log.info('GZCTF hub connected');
    } catch (err) {
      log.warn({ err }, 'GZCTF hub connect failed, retrying in 10s');
      setTimeout(startHub, 10_000);
    }
  }
  void startHub();

  return {
    async getGame() {
      return adaptGame(await get(`/api/game/${cfg.gameId}`, RawGame));
    },
    async getScoreboard() {
      lastBoard = adaptScoreboard(await get(`/api/game/${cfg.gameId}/scoreboard`, RawScoreboard), warnOnce);
      return lastBoard;
    },
    onSolve(cb) {
      listeners.push(cb);
    },
    hubState: () => hub.state,
  };
}

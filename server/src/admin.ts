// Admin API: shared-password login with a signed session cookie, and every control the panel needs.
import type { AdminState, LogEntry } from '@iboh/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import { config } from './config.js';
import { AutoConfigSchema, autoConfig, setAutoConfig, type Detectors } from './detectors.js';
import type { createMockSource } from './gzctf/mock.js';
import type { GzctfSource } from './gzctf/source.js';
import { deleteMedia, listMedia, saveMedia, validName, type MediaKind } from './media.js';
import { LoopUpdate, QueueAdd, type Engine } from './queue.js';
import { phaseAt, saveSettings, settings, type startState } from './state.js';

const COOKIE = 'iboh_admin';
const SESSION_MS = 7 * 24 * 3_600_000;
const sha = (s: string) => createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

// Stateless session: expiry + HMAC keyed on the admin password. Survives restarts; changing
// ADMIN_PASSWORD logs everyone out.
const mac = (exp: number) => createHmac('sha256', sha(`iboh-session:${config.adminPassword}`)).update(String(exp)).digest('base64url');
const issue = () => {
  const exp = Date.now() + SESSION_MS;
  return `${exp}.${mac(exp)}`;
};
function validSession(token: string | undefined) {
  const [exp, sig] = (token ?? '').split('.');
  return !!exp && !!sig && Number(exp) > Date.now() && sameSecret(sig, mac(Number(exp)));
}
const cookieOf = (req: FastifyRequest) =>
  req.headers.cookie?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);

function authed(req: FastifyRequest) {
  if (!config.adminPassword) return false;
  const header = req.headers['x-admin-password'];
  if (typeof header === 'string') return sameSecret(header, config.adminPassword); // scripts
  return validSession(cookieOf(req));
}

// Brute-force guard: 5 wrong passwords per IP, then locked out for 10 minutes.
const failures = new Map<string, { count: number; until: number }>();
const LOCK_MS = 10 * 60_000;

interface Deps {
  engine: Engine;
  state: ReturnType<typeof startState>;
  detectors: Detectors;
  source: GzctfSource;
  mock: ReturnType<typeof createMockSource> | null;
  recentErrors: LogEntry[];
}

const Kind = z.enum(['logos']);

export async function registerAdmin(app: FastifyInstance, { engine, state, detectors, source, mock, recentErrors }: Deps) {
  app.post('/api/admin/login', async (req, reply) => {
    const ip = req.ip;
    const f = failures.get(ip);
    if (f && f.count >= 5 && f.until > Date.now()) return reply.code(429).send({ error: 'Too many attempts. Try again in a few minutes.' });
    const body = z.object({ password: z.string().max(200) }).safeParse(req.body);
    if (!config.adminPassword) return reply.code(503).send({ error: 'ADMIN_PASSWORD is not set on the server.' });
    if (!body.success || !sameSecret(body.data.password, config.adminPassword)) {
      const next = f && f.until > Date.now() ? f.count + 1 : 1;
      failures.set(ip, { count: next, until: Date.now() + LOCK_MS });
      app.log.warn({ ip }, 'admin login failed');
      return reply.code(401).send({ error: 'Wrong password.' });
    }
    failures.delete(ip);
    const secure = req.protocol === 'https' ? '; Secure' : '';
    reply.header('set-cookie', `${COOKIE}=${issue()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`);
    return { ok: true };
  });

  app.post('/api/admin/logout', async (_req, reply) => {
    reply.header('set-cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    return { ok: true };
  });

  app.get('/api/admin/session', async (req) => ({ ok: authed(req) }));

  await app.register(async (admin) => {
    admin.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
      if (!authed(req)) return reply.code(401).send({ error: 'unauthorized' });
    });
    // Uploads arrive as the raw request body (any non-JSON type); saveMedia streams it with a size cap.
    admin.addContentTypeParser('*', (_req, payload, done) => done(null, payload));

    const bad = (reply: FastifyReply, error: z.ZodError) => reply.code(400).send({ error: error.flatten() });

    admin.get('/api/admin/state', async (): Promise<AdminState> => {
      const game = state.game();
      return {
        now: engine.now(),
        queue: engine.queue(),
        loop: engine.loop(),
        displays: engine.displays(),
        autoConfig: autoConfig(),
        game,
        phase: phaseAt(game, Date.now()),
        phaseOverride: settings.phaseOverride,
        venue: settings.venue,
        finalStretch: settings.finalStretch,
        finalHour: state.mode().finalHour,
        media: { logos: listMedia('logos') },
        health: {
          source: mock ? 'mock' : 'gzctf',
          hub: source.hubState?.() ?? 'n/a',
          ...state.health(),
          errors: recentErrors,
        },
        serverTime: Date.now(),
      };
    });

    // Queue
    admin.get('/api/admin/queue', async () => engine.snapshot());
    admin.post('/api/admin/queue', async (req, reply) => {
      const body = QueueAdd.safeParse(req.body);
      return body.success ? engine.add(body.data) : bad(reply, body.error);
    });
    admin.put('/api/admin/queue/order', async (req, reply) => {
      const body = z.object({ ids: z.array(z.string()).max(500) }).safeParse(req.body);
      if (!body.success) return bad(reply, body.error);
      engine.reorder(body.data.ids);
      return { ok: true };
    });
    admin.patch<{ Params: { id: string } }>('/api/admin/queue/:id', async (req, reply) => {
      const body = z
        .object({ durationMs: z.number().int().min(1000).max(600_000).nullable().optional(), priority: z.enum(['normal', 'high']).optional() })
        .safeParse(req.body);
      if (!body.success) return bad(reply, body.error);
      return engine.update(req.params.id, body.data) ? { ok: true } : reply.code(404).send({ error: 'not found' });
    });
    admin.delete<{ Params: { id: string } }>('/api/admin/queue/:id', async (req, reply) =>
      engine.remove(req.params.id) ? { ok: true } : reply.code(404).send({ error: 'not found' }),
    );
    admin.post('/api/admin/skip', async () => {
      engine.skip();
      return { ok: true };
    });

    // Loop and auto-events
    admin.put('/api/admin/loop', async (req, reply) => {
      const body = LoopUpdate.safeParse(req.body);
      if (!body.success) return bad(reply, body.error);
      engine.setLoop(body.data);
      return { ok: true };
    });
    admin.get('/api/admin/auto-events', async () => autoConfig());
    admin.put('/api/admin/auto-events', async (req, reply) => {
      const body = AutoConfigSchema.safeParse(req.body);
      if (!body.success) return bad(reply, body.error);
      setAutoConfig(body.data);
      return autoConfig();
    });

    // Phase override and settings
    admin.put('/api/admin/settings', async (req, reply) => {
      const body = z
        .object({
          venue: z.string().trim().min(1).max(120).optional(),
          phaseOverride: z.enum(['auto', 'pre', 'live', 'ended']).optional(),
          finalStretch: z
            .object({
              finalHour: z.enum(['auto', 'on', 'off']),
              finalHourMin: z.number().min(1).max(600),
              finalCountdown: z.boolean(),
              openingCountdown: z.boolean(),
              endedTop10: z.boolean(),
            })
            .optional(),
        })
        .safeParse(req.body);
      if (!body.success) return bad(reply, body.error);
      saveSettings(body.data);
      state.push();
      return { ok: true };
    });

    // Media
    admin.put<{ Params: { kind: string; name: string } }>('/api/admin/media/:kind/:name', async (req, reply) => {
      const kind = Kind.safeParse(req.params.kind);
      if (!kind.success || !validName(kind.data, req.params.name)) {
        return reply.code(400).send({ error: 'Use a plain file name with a supported extension (png, jpg, webp, gif).' });
      }
      try {
        const bytes = await saveMedia(kind.data as MediaKind, req.params.name, req.body as Readable);
        app.log.info({ kind: kind.data, name: req.params.name, bytes }, 'media uploaded');
        state.push();
        return { ok: true, bytes };
      } catch (err) {
        return reply.code(413).send({ error: err instanceof Error ? err.message : 'upload failed' });
      }
    });
    admin.delete<{ Params: { kind: string; name: string } }>('/api/admin/media/:kind/:name', async (req, reply) => {
      const kind = Kind.safeParse(req.params.kind);
      if (!kind.success || !deleteMedia(kind.data, req.params.name)) return reply.code(404).send({ error: 'not found' });
      state.push();
      return { ok: true };
    });

    // Rehearsal only: create the condition for an auto-event and skip its threshold/cooldown once.
    admin.post('/api/admin/mock/trigger', async (req, reply) => {
      if (!mock) return reply.code(404).send({ error: 'mock mode only' });
      const body = z.object({ kind: z.enum(['blood', 'takeover', 'wall-falls', 'on-fire', 'milestone', 'extend-end']) }).safeParse(req.body);
      if (!body.success) return bad(reply, body.error);
      const kind = body.data.kind;
      if (kind !== 'blood' && kind !== 'extend-end') detectors.force(kind);
      const result = mock.trigger(kind);
      await state.refresh(); // takeover is detected from the scoreboard: don't wait for the next poll
      return { result };
    });
  });
}

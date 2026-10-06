import fastifyStatic from '@fastify/static';
import type { ClientToServerEvents, ServerToClientEvents } from '@iboh/shared';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { config } from './config.js';
import { createGzctfClient } from './gzctf/client.js';
import { createMockSource } from './gzctf/mock.js';
import { AutoConfigSchema, autoConfig, createDetectors, setAutoConfig } from './detectors.js';
import { LoopUpdate, QueueAdd, startEngine, type Engine } from './queue.js';
import { z } from 'zod';
import { startState } from './state.js';
import { VIDEO_DIR } from './templates.js';

const app = Fastify({ logger: true });
const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server);

// Uploaded media (sponsor videos). Served in dev too; Vite proxies /media here.
await app.register(fastifyStatic, { root: VIDEO_DIR, prefix: '/media/videos/', decorateReply: false });

// Production: serve the built frontend. In dev, Vite serves it and proxies /socket.io here.
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.get('/', (_req, reply) => reply.redirect('/display'));
  app.get('/display', (_req, reply) => reply.sendFile('index.html'));
  app.get('/admin', (_req, reply) => reply.sendFile('index.html'));
}

const mock = config.gzctf ? null : createMockSource();
let engine: Engine | undefined;
const detectors = createDetectors({
  log: app.log,
  queue: (template, input) => {
    try {
      engine?.add({ template, input });
      app.log.info({ template }, 'auto-event queued');
    } catch (err) {
      app.log.error({ err, template }, 'auto-event rejected');
    }
  },
});
const state = startState(config.gzctf ? createGzctfClient(config.gzctf, app.log) : mock!, io, app.log, detectors);
engine = startEngine({ io, log: app.log, context: state.context, onChange: state.push });
state.setNowPlaying(engine.now);

// ---------- Admin API ----------
// ponytail: shared-password header for now; phase 5 puts the admin UI and a session cookie in front of these.
const digest = (s: string) => createHash('sha256').update(s).digest();
async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const given = req.headers['x-admin-password'];
  if (!config.adminPassword || typeof given !== 'string' || !timingSafeEqual(digest(given), digest(config.adminPassword))) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}

app.register(async (admin) => {
  admin.addHook('preHandler', requireAdmin);
  admin.get('/api/admin/queue', async () => engine!.snapshot());
  admin.post('/api/admin/queue', async (req, reply) => {
    const body = QueueAdd.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    return engine!.add(body.data);
  });
  admin.delete<{ Params: { id: string } }>('/api/admin/queue/:id', async (req, reply) =>
    engine!.remove(req.params.id) ? { ok: true } : reply.code(404).send({ error: 'not found' }),
  );
  admin.post('/api/admin/skip', async () => {
    engine!.skip();
    return { ok: true };
  });
  admin.get('/api/admin/auto-events', async () => autoConfig());
  admin.put('/api/admin/auto-events', async (req, reply) => {
    const body = AutoConfigSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    setAutoConfig(body.data);
    return autoConfig();
  });
  // Rehearsal only: create the condition for an auto-event and skip its threshold/cooldown once.
  admin.post('/api/admin/mock/trigger', async (req, reply) => {
    if (!mock) return reply.code(404).send({ error: 'mock mode only' });
    const body = z.object({ kind: z.enum(['blood', 'takeover', 'wall-falls', 'on-fire', 'milestone']) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    if (body.data.kind !== 'blood') detectors.force(body.data.kind);
    const result = mock.trigger(body.data.kind);
    await state.refresh(); // takeover is detected from the scoreboard: don't wait for the next poll
    return { result };
  });
  admin.put('/api/admin/loop', async (req, reply) => {
    const body = LoopUpdate.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    engine!.setLoop(body.data);
    return { ok: true };
  });
});

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(config.gzctf ? `GZCTF: ${config.gzctf.baseUrl} game ${config.gzctf.gameId}` : 'mock GZCTF mode');

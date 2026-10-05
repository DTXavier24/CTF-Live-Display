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
import { LoopUpdate, QueueAdd, startEngine } from './queue.js';
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

const state = startState(config.gzctf ? createGzctfClient(config.gzctf, app.log) : createMockSource(), io, app.log);
const engine = startEngine({ io, log: app.log, context: state.context, onChange: state.push });
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
  admin.get('/api/admin/queue', async () => engine.snapshot());
  admin.post('/api/admin/queue', async (req, reply) => {
    const body = QueueAdd.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    return engine.add(body.data);
  });
  admin.delete<{ Params: { id: string } }>('/api/admin/queue/:id', async (req, reply) =>
    engine.remove(req.params.id) ? { ok: true } : reply.code(404).send({ error: 'not found' }),
  );
  admin.post('/api/admin/skip', async () => {
    engine.skip();
    return { ok: true };
  });
  admin.put('/api/admin/loop', async (req, reply) => {
    const body = LoopUpdate.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    engine.setLoop(body.data);
    return { ok: true };
  });
});

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(config.gzctf ? `GZCTF: ${config.gzctf.baseUrl} game ${config.gzctf.gameId}` : 'mock GZCTF mode');

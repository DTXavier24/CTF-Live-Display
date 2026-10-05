import fastifyStatic from '@fastify/static';
import type { ServerToClientEvents } from '@iboh/shared';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { config } from './config.js';
import { createMockSource } from './gzctf/mock.js';
import { startState } from './state.js';

const app = Fastify({ logger: true });
const io = new Server<{}, ServerToClientEvents>(app.server);

// Production: serve the built frontend. In dev, Vite serves it and proxies /socket.io here.
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.get('/', (_req, reply) => reply.redirect('/display'));
  app.get('/display', (_req, reply) => reply.sendFile('index.html'));
  app.get('/admin', (_req, reply) => reply.sendFile('index.html'));
}

if (!config.mock) {
  // ponytail: real GZCTF client lands in phase 2, after verifying endpoints against the deployed OpenAPI docs.
  app.log.fatal('Real GZCTF client not implemented yet. Run with MOCK_GZCTF=1 (npm run dev:mock).');
  process.exit(1);
}

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(`mock GZCTF mode: ${config.mock}`);
startState(createMockSource(), io, app.log);

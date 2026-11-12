import fastifyStatic from '@fastify/static';
import type { AutoTemplate, ClientToServerEvents, LogEntry, ServerToClientEvents } from '@iboh/shared';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { registerAdmin } from './admin.js';
import { config } from './config.js';
import { autoConfig, createDetectors } from './detectors.js';
import { createGzctfClient } from './gzctf/client.js';
import { createMockSource } from './gzctf/mock.js';
import { MEDIA } from './media.js';
import { startEngine, type Engine } from './queue.js';
import { startState } from './state.js';

/** Last 50 warnings/errors, for the admin health panel. */
const recentErrors: LogEntry[] = [];

const app = Fastify({
  logger: {
    hooks: {
      logMethod(args, method, level) {
        if (level >= 40) {
          const msg = args.find((a): a is string => typeof a === 'string') ?? '';
          const err = (args[0] as { err?: { message?: string } } | undefined)?.err?.message;
          recentErrors.unshift({ time: Date.now(), level: level >= 50 ? 'error' : 'warn', msg: err ? `${msg}: ${err}` : msg });
          recentErrors.length = Math.min(recentErrors.length, 50);
        }
        return method.apply(this, args);
      },
    },
  },
});
const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server);

// Uploaded media. Served in dev too; Vite proxies /media here.
await app.register(fastifyStatic, { root: MEDIA.logos.dir, prefix: '/media/logos/', decorateReply: false });

// Production: serve the built frontend. In dev, Vite serves it and proxies /socket.io here.
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.get('/', (_req, reply) => reply.redirect('/display'));
  app.get('/display', (_req, reply) => reply.sendFile('index.html'));
  app.get('/admin', (_req, reply) => reply.sendFile('index.html'));
}

const mock = config.gzctf ? null : createMockSource();
const source = config.gzctf ? createGzctfClient(config.gzctf, app.log) : mock!;
let engine: Engine | undefined;
const detectors = createDetectors({
  log: app.log,
  queue: (template, input) => {
    try {
      const seconds = autoConfig().durations[template as AutoTemplate];
      engine?.add({ template, input, durationMs: seconds ? Math.round(seconds * 1000) : undefined });
      app.log.info({ template }, 'auto-event queued');
    } catch (err) {
      app.log.error({ err, template }, 'auto-event rejected');
    }
  },
});
const state = startState(source, io, app.log, detectors);
engine = startEngine({ io, log: app.log, context: state.context, onChange: state.push });
state.setNowPlaying(engine.now);
state.onModeChange((mode) => engine?.setPaused(mode.countdown || mode.startCountdown));

await registerAdmin(app, { engine, state, detectors, source, mock, recentErrors });

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(config.gzctf ? `GZCTF: ${config.gzctf.baseUrl} game ${config.gzctf.gameId}` : 'mock GZCTF mode');

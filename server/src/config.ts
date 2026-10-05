import { z } from 'zod';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // no .env: rely on the real environment
}

const env = z
  .object({
    PORT: z.coerce.number().int().default(3000),
    ADMIN_PASSWORD: z.string().min(1).optional(),
    MOCK_GZCTF: z.string().default('0'),
    MOCK_START_OFFSET_MIN: z.coerce.number().default(30),
    MOCK_DURATION_MIN: z.coerce.number().positive().default(600),
    MOCK_SOLVE_INTERVAL_SEC: z.coerce.number().positive().default(8),
    GZCTF_BASE_URL: z.string().url().transform((u) => u.replace(/\/+$/, '')).optional(),
    GZCTF_GAME_ID: z.coerce.number().int().positive().optional(),
    GZCTF_USERNAME: z.string().min(1).optional(),
    GZCTF_PASSWORD: z.string().min(1).optional(),
    GZCTF_INSECURE_TLS: z.string().default('0'),
  })
  .parse(process.env);

const mock = env.MOCK_GZCTF === '1' || process.argv.includes('--mock');

function gzctfConfig() {
  const { GZCTF_BASE_URL: baseUrl, GZCTF_GAME_ID: gameId, GZCTF_USERNAME: username, GZCTF_PASSWORD: password } = env;
  if (!baseUrl || !gameId || !username || !password) {
    throw new Error('Set GZCTF_BASE_URL, GZCTF_GAME_ID, GZCTF_USERNAME and GZCTF_PASSWORD in .env, or run with MOCK_GZCTF=1');
  }
  return { baseUrl, gameId, username, password };
}

if (!mock && env.GZCTF_INSECURE_TLS === '1') {
  // Test servers with self-signed certs only. Applies to fetch and the hub's WebSocket.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

export const config = {
  port: env.PORT,
  adminPassword: env.ADMIN_PASSWORD,
  mock,
  gzctf: mock ? null : gzctfConfig(),
  mockStartOffsetMin: env.MOCK_START_OFFSET_MIN,
  mockDurationMin: env.MOCK_DURATION_MIN,
  mockSolveIntervalSec: env.MOCK_SOLVE_INTERVAL_SEC,
};

import { z } from 'zod';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // no .env: rely on the real environment
}

const env = z
  .object({
    PORT: z.coerce.number().int().default(3000),
    MOCK_GZCTF: z.string().default('0'),
    MOCK_START_OFFSET_MIN: z.coerce.number().default(30),
    MOCK_DURATION_MIN: z.coerce.number().positive().default(600),
    MOCK_SOLVE_INTERVAL_SEC: z.coerce.number().positive().default(8),
  })
  .parse(process.env);

export const config = {
  port: env.PORT,
  mock: env.MOCK_GZCTF === '1' || process.argv.includes('--mock'),
  mockStartOffsetMin: env.MOCK_START_OFFSET_MIN,
  mockDurationMin: env.MOCK_DURATION_MIN,
  mockSolveIntervalSec: env.MOCK_SOLVE_INTERVAL_SEC,
};

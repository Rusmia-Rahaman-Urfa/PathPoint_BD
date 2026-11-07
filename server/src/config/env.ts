import { z } from 'zod';
import dotenv from 'dotenv';

// dotenv never overrides variables that are already set (important for tests).
dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().min(2).default('15m'),
  JWT_ISSUER: z.string().min(1).default('pathpoint-bd'),
  JWT_AUDIENCE: z.string().min(1).default('pathpoint-bd-api'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  GEO_DEFAULT_PICKUP_RADIUS_M: z.coerce.number().int().positive().default(3_000),
  GEO_DEFAULT_DROPOFF_RADIUS_M: z.coerce.number().int().positive().default(3_000),

  /** Demo traffic simulator. Disable in tests or if you want a quiet stream. */
  TRAFFIC_SIM_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  TRAFFIC_SIM_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(15_000),
  SSE_HEARTBEAT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),

  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Fail fast: a half-configured server is worse than a crashed one.
  console.error(`[config] Invalid environment configuration:\n${details}`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  isDevelopment: raw.NODE_ENV === 'development',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;

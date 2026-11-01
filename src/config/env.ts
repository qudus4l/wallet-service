import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

/**
 * Environment contract. Parsed once at boot; any violation stops the process
 * with a readable error instead of failing later at runtime.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_SSL: booleanString.default(false),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_ISSUER: z.string().min(1).default('wallet-service'),
    JWT_AUDIENCE: z.string().min(1).default('wallet-service-api'),
    JWT_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(12, 'ADMIN_PASSWORD must be at least 12 characters').optional(),

    DEFAULT_CURRENCY: z
      .string()
      .regex(/^[A-Z]{3}$/, 'DEFAULT_CURRENCY must be an ISO 4217 code')
      .default('NGN'),
    /** Upper bound for a single transfer/deposit, in minor units. */
    MAX_TRANSACTION_AMOUNT: z.coerce
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .default(1_000_000_000),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: csv.default([]),
    SWAGGER_ENABLED: booleanString.default(true),
    RATE_LIMIT_ENABLED: booleanString.default(true),
  })
  .refine((env) => Boolean(env.ADMIN_EMAIL) === Boolean(env.ADMIN_PASSWORD), {
    message: 'ADMIN_EMAIL and ADMIN_PASSWORD must be set together',
    path: ['ADMIN_PASSWORD'],
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

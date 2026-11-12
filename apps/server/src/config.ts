import { z } from 'zod';

const httpsUrl = z.url().refine(value => new URL(value).protocol === 'https:', 'HTTPS is required');
const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_VERSION: z.string().min(1).max(100).default('local'),
  PUBLIC_ORIGIN: z.url().refine(value => { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && url.origin === value; }, 'A plain HTTP(S) origin is required').default('http://127.0.0.1:5173'),
  ROOM_TOKEN_SECRET: z.string().regex(/^[0-9a-f]{64}$/, 'Use a generated 32-byte hex room secret').optional(),
  SERVE_WEB: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  DATABASE_URL: z.url().refine(value => ['postgresql:', 'postgres:'].includes(new URL(value).protocol), 'PostgreSQL URL is required').optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  AUTH_ISSUER: httpsUrl.optional(),
  AUTH_AUDIENCE: z.string().min(1).optional(),
  AUTH_JWKS_URL: httpsUrl.optional(),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.url().optional(),
}).superRefine((env, ctx) => {
  const configured = [env.AUTH_ISSUER, env.AUTH_AUDIENCE, env.AUTH_JWKS_URL].filter(Boolean).length;
  if (configured !== 0 && configured !== 3) ctx.addIssue({ code: 'custom', message: 'Configure all three AUTH settings together', path: ['AUTH_ISSUER'] });
  if (env.NODE_ENV === 'production' && !env.DATABASE_URL) ctx.addIssue({ code: 'custom', message: 'Production requires database configuration', path: ['DATABASE_URL'] });
  if (env.NODE_ENV === 'production' && configured !== 3) ctx.addIssue({ code: 'custom', message: 'Production requires authentication configuration', path: ['AUTH_ISSUER'] });
  if (env.NODE_ENV === 'production' && !env.ROOM_TOKEN_SECRET) ctx.addIssue({ code: 'custom', message: 'Production requires room credentials configuration', path: ['ROOM_TOKEN_SECRET'] });
  if (env.NODE_ENV === 'production' && new URL(env.PUBLIC_ORIGIN).protocol !== 'https:') ctx.addIssue({ code: 'custom', message: 'Production requires HTTPS', path: ['PUBLIC_ORIGIN'] });
});

export type Config = z.infer<typeof EnvironmentSchema>;
export function readConfig(env: Record<string, string | undefined>): Config {
  const result = EnvironmentSchema.safeParse(env);
  // Never echo raw environment values or Zod input data into startup logs.
  if (!result.success) throw new Error(`Invalid configuration: ${result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  return result.data;
}

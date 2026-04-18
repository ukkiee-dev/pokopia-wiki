import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z
    .string()
    .default('*')
    .transform((v) => {
      const trimmed = v.trim();
      if (trimmed === '') return [] as string[];
      if (trimmed === '*') return '*' as const;
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }),
});

export const env = EnvSchema.parse(process.env);

export type Env = z.infer<typeof EnvSchema>;

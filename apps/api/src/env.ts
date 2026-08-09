import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_PATH: z.string().default('./data/fairshare.db'),
  UPLOAD_DIR: z.string().default('./data/uploads'),
  JWT_SECRET: z.string().min(32).default('development-only-secret-change-me-please'),
  APP_ORIGIN: z.string().default('http://localhost:8081'),
  FX_PROVIDER_URL: z.string().url().default('https://api.frankfurter.app'),
  OCR_PROVIDER: z.enum(['disabled', 'local', 'openai']).default('local'),
  TESSERACT_LANG: z.string().trim().min(1).default('eng'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_VISION_MODEL: z.string().default('gpt-4.1-mini'),
});

const parsed = schema.parse(process.env);
export const env = {
  ...parsed,
  DATABASE_PATH: resolve(parsed.DATABASE_PATH),
  UPLOAD_DIR: resolve(parsed.UPLOAD_DIR),
};
mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
mkdirSync(env.UPLOAD_DIR, { recursive: true });

import { z } from 'zod'

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgresql://')),

  // Auth
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),

  // Meta API (Optional for core boot, required when Meta operations are invoked)
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_REDIRECT_URI: z.string().url().optional(),
  META_API_VERSION: z.string().default('v21.0'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  // OpenAI (Optional for core boot, required when AI operations are invoked)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_BUDGET_USD: z.string().default('100.00'),

  // Email
  RESEND_API_KEY: z.string().optional(),

  // Platform safety limits
  MAX_DMS_PER_DAY: z.string().default('30').transform(Number),
  MIN_SECONDS_BETWEEN_DMS: z.string().default('90').transform(Number),
  MAX_SECONDS_BETWEEN_DMS: z.string().default('240').transform(Number),
  OPERATING_HOURS_START: z.string().default('9').transform(Number),
  OPERATING_HOURS_END: z.string().default('20').transform(Number),
  OPERATING_TIMEZONE: z.string().default('Europe/Lisbon'),

  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export type Env = z.infer<typeof envSchema>

let parsedEnv: Env | null = null

export function getEnv(): Env {
  if (parsedEnv) return parsedEnv

  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten())
    throw new Error('Invalid environment variables')
  }

  parsedEnv = result.data
  return parsedEnv
}

export function getMetaEnv() {
  const env = getEnv()
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_REDIRECT_URI) {
    throw new Error('Configurações da Meta incompletas (META_APP_ID, META_APP_SECRET, META_REDIRECT_URI).')
  }
  return {
    META_APP_ID: env.META_APP_ID,
    META_APP_SECRET: env.META_APP_SECRET,
    META_REDIRECT_URI: env.META_REDIRECT_URI,
    META_API_VERSION: env.META_API_VERSION,
  }
}

export function getOpenAIEnv() {
  const env = getEnv()
  if (!env.OPENAI_API_KEY) {
    throw new Error('Chave OPENAI_API_KEY não configurada.')
  }
  return {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_MODEL: env.OPENAI_MODEL,
    OPENAI_BUDGET_USD: env.OPENAI_BUDGET_USD,
  }
}


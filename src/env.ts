import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const optionalDebugFlag = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() || undefined : value),
  z.enum(['0', '1']).optional()
)

const serverEnvShape = {
  SERVER_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL_GATEKEEPER: z.string().min(1),
  GEMINI_MODEL_EXTRACTOR: z.string().min(1),
  GEMINI_MODEL_EMBEDDING: z.string().min(1),
  GEMINI_MAX_RETRIES: z.coerce.number().int().min(1).max(10),
  GEMINI_MIN_REQUEST_DELAY_MS: z.coerce.number().int().min(1000).max(10000),
  GEMINI_DEBUG: optionalDebugFlag,
} as const

const serverEnvSchema = z.object(serverEnvShape)

export type ServerEnv = z.infer<typeof serverEnvSchema>

/**
 * Env slice used by {@link GeminiService} only. Keeps unit tests and CI workers
 * from needing gatekeeper/extractor model vars when the service gets explicit
 * constructor options.
 */
const geminiServiceRuntimeSchema = z.object({
  GEMINI_API_KEY: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string().min(1).optional()
  ),
  GEMINI_MODEL_EMBEDDING: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string().min(1).optional()
  ),
  GEMINI_MAX_RETRIES: z.preprocess(
    (value) => (value === undefined || value === '' ? 5 : value),
    z.coerce.number().int().min(1).max(10)
  ),
  GEMINI_MIN_REQUEST_DELAY_MS: z.preprocess(
    (value) => (value === undefined || value === '' ? 1000 : value),
    z.coerce.number().int().min(1000).max(10000)
  ),
  GEMINI_DEBUG: optionalDebugFlag,
})

export type GeminiServiceRuntimeEnv = z.infer<typeof geminiServiceRuntimeSchema>

export function getGeminiServiceRuntimeEnv(): GeminiServiceRuntimeEnv {
  return geminiServiceRuntimeSchema.parse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL_EMBEDDING: process.env.GEMINI_MODEL_EMBEDDING,
    GEMINI_MAX_RETRIES: process.env.GEMINI_MAX_RETRIES,
    GEMINI_MIN_REQUEST_DELAY_MS: process.env.GEMINI_MIN_REQUEST_DELAY_MS,
    GEMINI_DEBUG: process.env.GEMINI_DEBUG,
  })
}

export function getServerEnv(): ServerEnv {
  return serverEnvSchema.parse(process.env)
}

export function getClientEnv() {
  return createEnv({
    server: serverEnvShape,

    /**
     * The prefix that client-side variables must have. This is enforced both at
     * a type-level and at runtime.
     */
    clientPrefix: 'VITE_',

    client: {
      VITE_APP_TITLE: z.string().min(1).optional(),
    },

    /**
     * What object holds the environment variables at runtime. This is usually
     * `process.env` or `import.meta.env`.
     */
    runtimeEnv: import.meta.env,

    /**
     * By default, this library will feed the environment variables directly to
     * the Zod validator.
     *
     * This means that if you have an empty string for a value that is supposed
     * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
     * it as a type mismatch violation. Additionally, if you have an empty string
     * for a value that is supposed to be a string with a default value (e.g.
     * `DOMAIN=` in an ".env" file), the default value will never be applied.
     *
     * In order to solve these issues, we recommend that all new projects
     * explicitly specify this option as true.
     */
    emptyStringAsUndefined: true,
  })
}

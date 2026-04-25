import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const optionalDebugFlag = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() || undefined : value),
  z.enum(['0', '1']).optional()
)

const serverEnvShape = {
  SERVER_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL_GATEKEEPER: z.string().min(1),
  GEMINI_MODEL_EXTRACTOR: z.string().min(1),
  GEMINI_MAX_RETRIES: z.coerce.number().int().min(1).max(10),
  GEMINI_MIN_REQUEST_DELAY_MS: z.coerce.number().int().min(1000).max(10000),
  GEMINI_DEBUG: optionalDebugFlag,
} as const

const serverEnvSchema = z.object(serverEnvShape)

export type ServerEnv = z.infer<typeof serverEnvSchema>

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

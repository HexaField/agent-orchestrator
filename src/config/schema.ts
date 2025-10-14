import { z } from 'zod'

export const ConfigSchema = z.object({
  LLM_PROVIDER: z.string().default('vllm'),
  LLM_MODEL: z.string().default('gpt-oss:20b'),
  LLM_ENDPOINT: z.string().url().default('http://localhost:8000/v1'),
  AGENT: z.string().default('codex-cli'),
  CODEX_API_BASE: z.string().url().optional(),
  GIT_REMOTE: z.string().default('origin'),
  BRANCH_PREFIX: z.string().default('agent/'),
  NON_INTERACTIVE: z.coerce.boolean().default(false)
})

export type AppConfig = z.infer<typeof ConfigSchema>

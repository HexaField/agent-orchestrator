import { z } from 'zod'

export const ConfigSchema = z.object({
  /**
   * LLM_PROVIDER can be one of: 'vllm', 'passthrough', 'ollama'
   * This project supports only local LLM providers. To use a local provider set
   * `LLM_PROVIDER` (e.g. `ollama`) and point `LLM_ENDPOINT` at the provider's HTTP
   * endpoint (example: http://localhost:11434/v1).
   */
  // Minimal project config surface. Keep other legacy keys optional.
  AGENT: z.string().default('agent-replay'),
  LLM_PROVIDER: z.string().default('ollama'),
  LLM_MODEL: z.string().default('gpt-oss:20b'),
  LLM_ENDPOINT: z.string().url().optional(),
  // Optional/legacy
  CODEX_API_BASE: z.string().url().optional(),
  // Project-only optional flags
  ALLOW_COMMANDS: z.boolean().optional(),
  USE_LLM_GEN: z.boolean().optional(),
  RESPONSE_TYPE: z.enum(['patches', 'files', 'commands', 'mixed']).optional(),
  SKIP_VERIFY: z.boolean().optional()
})

export type AppConfig = z.infer<typeof ConfigSchema>

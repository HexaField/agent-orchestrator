import { z } from 'zod'

export const ConfigSchema = z.object({
  /**
   * LLM_PROVIDER can be one of: 'vllm', 'openai', 'openai-compatible', 'passthrough', 'ollama'
   * To use Ollama locally set LLM_PROVIDER=ollama and OLLAMA_SERVER_URL (or OLLAMA_API_BASE) to point
   * at your Ollama HTTP endpoint (example: http://localhost:11434).
   */
  // Minimal project config surface. Keep other legacy keys optional.
  AGENT: z.string().default('agent-replay'),
  LLM_PROVIDER: z.string().default('passthrough'),
  LLM_MODEL: z.string().default('gpt-oss:20b'),
  LLM_ENDPOINT: z.string().url().optional(),
  // Optional/legacy
  CODEX_API_BASE: z.string().url().optional()
})

export type AppConfig = z.infer<typeof ConfigSchema>

/**
 * LLM adapter interfaces
 *
 * These interfaces describe the minimal contract for local LLM adapters
 * (Ollama, vLLM, etc.) used by the TaskLoop.
 */

/** Message role used in LLM calls */
export type Role = 'system' | 'user' | 'assistant'

/** Single chat message passed to an LLM adapter */
export interface Message {
  role: Role
  content: string
}

/**
 * Result returned by an LLM adapter call.
 */
export interface LLMCallResult {
  /** Raw text content returned by the model */
  text: string
  /** Optional number of tokens consumed by the call */
  tokensUsed?: number
  /** Optional citations (provider-specific) */
  citations?: Array<Record<string, any>>
  /** Optional structured tasks parsed from the model output */
  parsedTasks?: Array<Record<string, any>>
}

/**
 * Minimal LLMAdapter contract used by the orchestrator.
 */
export interface LLMAdapter {
  /**
   * Call the LLM with a sequence of messages and optional options.
   */
  call(messages: Message[], opts?: { maxTokens?: number; temperature?: number }): Promise<LLMCallResult>

  /**
   * Optional health check used by tests or orchestration to verify liveness.
   */
  health?(): Promise<boolean>
}

/**
 * Example usage (commented):
 *
 * const res = await ollamaAdapter.call([
 *   { role: 'system', content: 'You are a helpful assistant' },
 *   { role: 'user', content: 'Create a file README.md with a single line "hello"' }
 * ])
 */

import ollama from 'ollama'
import type { LLMAdapter, LLMCallResult, Message } from './interface'

export type OllamaAdapterConfig = {
  model?: string
  numCtx?: number
  /** Optional per-call timeout in milliseconds */
  timeoutMs?: number
}

const DEFAULT_MODEL = 'llama3.2'
const DEFAULT_NUM_CTX = 128000

/**
 * Create an Ollama-based LLM adapter.
 *
 * All configuration must be provided via the `config` parameter (no env reads).
 */
export function createOllamaAdapter(config: OllamaAdapterConfig = {}): LLMAdapter {
  const model = config.model || DEFAULT_MODEL
  const numCtx = config.numCtx || DEFAULT_NUM_CTX

  async function call(messages: Message[]): Promise<LLMCallResult> {
    const payloadMessages = messages.map((m) => ({ role: m.role, content: m.content }))

    const response = await ollama.chat({
      model,
      options: {
        num_ctx: numCtx
      },
      stream: true,
      messages: payloadMessages
    })

    let resultText = ''

    // response is an async iterable when stream=true
    if (response) {
      for await (const chunk of response) {
        if (chunk?.message?.content) {
          resultText += chunk.message.content
        }
      }
    }

    return {
      text: resultText
    }
  }

  return {
    call
  }
}

export default createOllamaAdapter

import type { LLMAdapter } from '../../types/adapters'
import { createOpenAICompatible } from './openai-compatible'
import { createOpenAI } from './openai'
import { createPassthrough } from './passthrough'
import { createVllm } from './vllm'
import { createOllama } from './ollama'

export function getLLMAdapter(name: string, opts: { endpoint?: string; model?: string }): LLMAdapter {
  switch (name) {
    case 'vllm':
      return createVllm({ endpoint: opts.endpoint, model: opts.model })
    case 'ollama':
      return createOllama({ endpoint: opts.endpoint, model: opts.model })
    case 'openai-compatible':
      return createOpenAICompatible({
        endpoint: opts.endpoint,
        model: opts.model
      })
    case 'openai':
      return createOpenAI({ endpoint: opts.endpoint, model: opts.model })
    case 'passthrough':
      return createPassthrough()
    default:
      throw new Error(`Unknown LLM adapter: ${name}`)
  }
}

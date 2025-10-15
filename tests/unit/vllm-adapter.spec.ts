import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVllm } from '../../src/adapters/llm/vllm'

describe('vLLM adapter', () => {
  beforeEach(() => vi.restoreAllMocks())

  afterEach(() => vi.restoreAllMocks())

  it('sends doubled max_tokens in request body', async () => {
    const captured: any = { body: null }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: any) => {
        captured.body = JSON.parse(opts.body)
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'ok' } }] })
        } as any
      })
    )

    const adapter = createVllm({})
    const res = await adapter.generate({ prompt: 'hi' })

    expect(res.text).toBe('ok')
    expect(captured.body).toBeTruthy()
    // default max_tokens doubled to 8192 (previously 4096 -> doubled again per request)
    expect(captured.body.max_tokens).toBe(8192)
  })
})

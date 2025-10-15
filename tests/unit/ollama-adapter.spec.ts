import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOllama } from '../../src/adapters/llm/ollama'

// Mock global fetch
const originalFetch = globalThis.fetch

describe('Ollama adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends doubled max_tokens and options.num_ctx in request body', async () => {
    const captured: any = { body: null }
    // mock fetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: any) => {
        captured.body = JSON.parse(opts.body)
        return {
          ok: true,
          json: async () => ({ output: [{ content: 'ok' }] })
        } as any
      })
    )

    const adapter = createOllama({})
    const res = await adapter.generate({ prompt: 'hello' })

    expect(res.text).toBe('ok')
    expect(captured.body).toBeTruthy()
    // default max_tokens was doubled to 8192 (previously 4096 -> we doubled again per request)
    expect(captured.body.max_tokens).toBe(8192)
    expect(captured.body.options).toBeTruthy()
    expect(captured.body.options.num_ctx).toBe(32768)
  })
})

// restore original fetch after all tests
afterEach(() => {
  globalThis.fetch = originalFetch
})

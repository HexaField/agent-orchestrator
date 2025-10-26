import { describe, expect, test } from 'vitest'
import createOllamaAdapter from './ollama'

describe('Ollama LLM Adapter (integration)', () => {
  const adapter = createOllamaAdapter({
    model: 'llama3.2'
  })

  test('call should return non-empty text', async () => {
    const res = await adapter.call([
      { role: 'system', content: 'You are a concise assistant.' },
      { role: 'user', content: 'Respond with the single word: ping' }
    ])

    expect(res).toBeDefined()
    expect(typeof res.text).toBe('string')
    expect(res.text.length).toBeGreaterThan(0)
  }, 120000)
})

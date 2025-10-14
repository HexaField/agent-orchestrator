import type { LLMAdapter } from '../../types/adapters'

export function createOpenAICompatible(opts: { endpoint?: string; model?: string }): LLMAdapter {
  const endpoint = opts.endpoint ?? 'http://localhost:8000/v1'
  const model = opts.model ?? 'gpt-oss:20b'
  return {
    name: 'openai-compatible',
    async generate(input) {
      const url = `${endpoint}/completions`
      const body = {
        model,
        prompt: input.prompt,
        temperature: input.temperature ?? 0,
        max_tokens: input.maxTokens ?? 512,
        stop: input.stop
      } as any
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(`LLM error ${res.status}`)
      const json = (await res.json()) as any
      const text = json.choices?.[0]?.text ?? ''
      return { text, raw: json }
    }
  }
}

import type { LLMAdapter } from '../../types/adapters'

export function createVllm(opts: { endpoint?: string; model?: string }): LLMAdapter {
  const endpoint = opts.endpoint ?? 'http://localhost:8000/v1'
  const model = opts.model ?? 'gpt-oss:20b'
  return {
    name: 'vllm',
    async generate(input) {
      const url = `${endpoint}/chat/completions`
      // vLLM uses an OpenAI-compatible API server. The max context/window is
      // configured server-side (model/server args). We increase max_tokens
      // requested here to avoid short responses, but increasing the context
      // length itself typically requires adjusting the vLLM server/model config.
      const body = {
        model,
        temperature: input.temperature ?? 0,
        // doubled default to reduce truncation
        max_tokens: input.maxTokens ?? 8192,
        stop: input.stop,
        messages: [
          ...(input.system ? [{ role: 'system', content: input.system }] : []),
          { role: 'user', content: input.prompt }
        ]
      } as any
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        throw new Error(`LLM error ${res.status}`)
      }
      const json = (await res.json()) as any
      const text = json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? ''
      return { text, raw: json }
    }
  }
}

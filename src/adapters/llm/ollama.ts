import type { LLMAdapter } from '../../types/adapters'

export function createOllama(opts: { endpoint?: string; model?: string }): LLMAdapter {
  const endpoint = opts.endpoint ?? 'http://localhost:11434'
  const model = opts.model ?? 'ollama:latest'

  return {
    name: 'ollama',
    async generate(input) {
      const url = `${endpoint.replace(/\/$/, '')}/api/generate`
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

      let text = ''
      if (Array.isArray(json.output) && json.output[0]) {
        text = json.output[0].content ?? json.output[0].text ?? ''
      } else if (Array.isArray(json.choices) && json.choices[0]) {
        text = json.choices[0].message?.content ?? json.choices[0].text ?? ''
      } else if (typeof json.result === 'string') {
        text = json.result
      } else if (typeof json.output === 'string') {
        text = json.output
      }

      return { text: text ?? '', raw: json }
    }
  }
}

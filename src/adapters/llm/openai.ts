import type { LLMAdapter } from '../../types/adapters'

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms))
}

async function retryFetch(url: string, opts: RequestInit, retries = 3) {
  let lastErr: unknown
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, opts)
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        const err = new Error(`HTTP ${res.status}: ${body}`)
        lastErr = err
        // retry on 5xx
        if (res.status >= 500 && i < retries - 1) {
          await sleep(2 ** i * 100 + Math.random() * 50)
          continue
        }
        throw err
      }
      return res
    } catch (err) {
      lastErr = err
      if (i < retries - 1) {
        await sleep(2 ** i * 100 + Math.random() * 50)
        continue
      }
      throw lastErr
    }
  }
  throw lastErr
}

export function createOpenAI(opts: { endpoint?: string; model?: string } = {}): LLMAdapter {
  const endpoint = opts.endpoint ?? 'https://api.openai.com/v1'
  const model = opts.model ?? 'gpt-3.5-turbo'
  // API key remains environment-based (secrets should not be written to project config)
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY

  return {
    name: 'openai',
    async generate(input) {
      const url = `${endpoint.replace(/\/$/, '')}/chat/completions`
      const messages: Array<{ role: string; content: string }> = []
      if (input.system) messages.push({ role: 'system', content: input.system })
      messages.push({ role: 'user', content: input.prompt })

      const body: any = {
        model,
        messages,
        temperature: input.temperature ?? 0
      }
      if (input.maxTokens) body.max_tokens = input.maxTokens

      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (apiKey) headers.authorization = `Bearer ${apiKey}`

      const res = await retryFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })

      const json = (await res.json()) as any
      const text = json.choices?.[0]?.message?.content ?? ''
      return { text, raw: json }
    }
  }
}

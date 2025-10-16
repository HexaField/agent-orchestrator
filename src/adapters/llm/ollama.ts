import type { LLMAdapter } from '../../types/adapters'

export function createOllama(opts: { endpoint?: string; model?: string }): LLMAdapter {
  const endpoint = opts.endpoint ?? 'http://localhost:11434'
  const model = opts.model ?? 'ollama:latest'

  return {
    name: 'ollama',
    async generate(input) {
      // start
      const url = `${endpoint.replace(/\/$/, '')}/api/generate`
      // Increase max_tokens default to reduce silent truncation and request
      // a larger context window via `options.num_ctx` (Ollama internal API).
      // Note: persistent changes to context should be done via a Modelfile
      // (PARAMETER num_ctx ...) and creating a model, but the internal
      // `/api/generate` examples accept `options.num_ctx` at request time.
      const body = {
        model,
        prompt: input.prompt,
        temperature: input.temperature ?? 0,
        // doubled default to reduce truncation
        max_tokens: input.maxTokens ?? 8192,
        stop: input.stop,
        // request larger context window at runtime (doubled)
        options: { num_ctx: 32768 }
      } as any

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(`LLM error ${res.status}`)

      // Ollama's internal `/api/generate` often streams NDJSON chunks.
      // Attempt to parse streaming NDJSON and assemble the final text.
      // bind headers.get safely to avoid 'Illegal invocation' when
      // extracting header values from undici's Headers implementation
      const headersGet = (k: string) => {
        try {
          return typeof (res.headers as any)?.get === 'function'
            ? (res.headers as any).get.call(res.headers, k)
            : (res.headers as any)?.[k]
        } catch {
          return (res.headers as any)?.[k]
        }
      }
      const contentType = (headersGet('content-type') || '') as string

      if (
        String(contentType).includes('application/x-ndjson') ||
        String(contentType).includes('application/ndjson') ||
        String(headersGet('transfer-encoding')) === 'chunked'
      ) {
        const reader = (res.body as any).getReader()
        const decoder = new TextDecoder('utf-8')
        let done = false
        let buffer = ''
        const chunks: any[] = []
        let assembled = ''

        while (!done) {
          const { value, done: streamDone } = await reader.read()
          if (value) buffer += decoder.decode(value, { stream: true })
          // split full lines
          const parts = buffer.split(/\r?\n/)
          // keep the last partial line in buffer
          buffer = parts.pop() || ''
          for (const part of parts) {
            const line = part.trim()
            if (!line) continue
            try {
              const obj = JSON.parse(line)
              chunks.push(obj)
              if (typeof obj.response === 'string') assembled = obj.response
              if (typeof obj.thinking === 'string') {
                // some versions use 'thinking' partial text; append if response empty
                if (!assembled) assembled += obj.thinking
              }
              if (obj.done) {
                done = true
              }
            } catch {
              // ignore parse errors for partial lines
            }
          }
          if (streamDone) break
        }

        return { text: assembled ?? '', raw: chunks }
      }

      // fallback: non-streaming response
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

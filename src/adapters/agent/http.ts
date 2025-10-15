import type { AgentAdapter } from '../../types/adapters'

export function createHttpAgent(): AgentAdapter {
  return {
    name: 'http',
    async run(input) {
      const endpoint = (input.env && input.env['AGENT_HTTP_ENDPOINT']) || process.env.AGENT_HTTP_ENDPOINT
      if (!endpoint) throw new Error('AGENT_HTTP_ENDPOINT not configured for http agent')
      const body = { prompt: input.prompt }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) return { stdout: '', stderr: `agent http error: ${res.status}`, exitCode: 1 }
      const json = (await res.json()) as any
      return {
        stdout: String(json.stdout ?? json.text ?? ''),
        stderr: String(json.stderr ?? ''),
        exitCode: Number(json.exitCode ?? 0)
      }
    }
  }
}

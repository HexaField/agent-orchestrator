import http from 'http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHttpAgent } from '../../src/adapters/agent/http'

describe('HTTP agent adapter', () => {
  let server: http.Server
  let url: string

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c.toString()))
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ stdout: 'ok', stderr: '', exitCode: 0 }))
      })
    })
    await new Promise((r) => server.listen(0, () => r(undefined)))
    const addr: any = server.address()
    const host = addr.address === '::' ? '127.0.0.1' : addr.address
    url = `http://${host}:${addr.port}`
  })

  afterAll(async () => {
    await new Promise((r) => server.close(r))
  })

  it('normalizes responses from a stub agent endpoint', async () => {
    const agent = createHttpAgent()
    const res = await agent.run({ prompt: 'hello', cwd: '.', timeoutMs: 2000, env: { AGENT_HTTP_ENDPOINT: url } })
    expect(res.stdout).toBe('ok')
    expect(res.stderr).toBe('')
    expect(res.exitCode).toBe(0)
  })
})

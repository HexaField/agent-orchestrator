import http from 'http'
import type { IncomingMessage, ServerResponse } from 'http'
import { AddressInfo } from 'net'
import fs from 'fs'
import path from 'path'

// Minimal LLM stub for tests. Start with provider-aware responses for
// OpenAI-compatible or Ollama-style adapters. The stub maps incoming
// prompts to fixture responses if available under tests/e2e/fixtures/llm.

export type StubServer = {
  url: string
  port: number
  stop(): Promise<void>
}

function loadFixture(prompt: string) {
  try {
    const fixturesDir = path.join(process.cwd(), 'tests', 'e2e', 'fixtures', 'llm')
    const safeName = prompt.replace(/[^a-z0-9]+/gi, '_').slice(0, 128)
    const fp = path.join(fixturesDir, safeName + '.json')
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, 'utf8'))
    }
  } catch {}
  return null
}

export async function startStub(port = 0): Promise<StubServer> {
  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    // Only support POST for the LLM endpoints used in tests
    if (req.method !== 'POST') {
      res.statusCode = 404
      return res.end('not found')
    }
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      let body: any = {}
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {}

      // Provider-specific shapes: support simple OpenAI-compatible and
      // Ollama flows. Look for prompt in common fields.
      const prompt = (body.prompt || (body.messages && body.messages.map((m: any) => m.content).join('\n')) || body.input || '') as string

      // Try to load a fixture matching the prompt, else return a default
      const fx = loadFixture(prompt)
      if (fx) {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(fx))
        return
      }

      // Generic default response: mirror the prompt back to the caller
      const defaultResp = {
        id: 'stub-1',
        object: 'response',
        created: Date.now(),
        model: 'stub-model',
        choices: [
          {
            text: String(prompt),
            index: 0,
            finish_reason: 'stop'
          }
        ]
      }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(defaultResp))
    })
  })

  return new Promise<StubServer>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      const url = `http://127.0.0.1:${addr.port}/v1`
      resolve({
        url,
        port: addr.port,
        stop: async () => {
          return new Promise<void>((res2) => server.close(() => res2()))
        }
      })
    })
    server.on('error', reject)
  })
}

import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import type { LLMAdapter } from '../../src/adapters/llm/interface'
import runTaskLoop from '../../src/orchestrator/taskLoop'

describe('Integration: taskLoop feedback persistence', () => {
  it('writes feedback JSON to provenance and marks summary.success true when feedback is complete', async () => {
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ao-int-'))

    // stub agent
    const agent = {
      async startSession() {
        return 's1'
      },
      async run(_sessionId: string, _input: string) {
        return { text: 'did something' }
      },
      async stop() {
        return
      }
    }

    // stub LLM returns a deterministic JSON response indicating completion
    const payload = JSON.stringify({ verdict: 'complete', confidence: 0.95, rationale: 'ok', issues: [], steering: [] })
    const llm: LLMAdapter = {
      async call() {
        return { text: payload }
      }
    }

    const res = await runTaskLoop({ task: 'do x', agent: agent as any, llm, workDir: tmp, maxIterations: 3 })

    expect(res.summary.success).toBe(true)

    // provenance file should exist
    const provPath = path.join(res.artifactsPath, 'provenance', '001-feedback.json')
    const exists = await fs.promises
      .stat(provPath)
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(true)

    const content = JSON.parse(await fs.promises.readFile(provPath, { encoding: 'utf8' }))
    expect(content.verdict).toBe('complete')
    expect(typeof content.metrics?.durationMs).toBe('number')
  })
})

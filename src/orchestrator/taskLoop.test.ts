import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, test } from 'vitest'
import { createOpenCodeAgentAdapter } from '../adapters/agent/opencode'
import createOllamaAdapter from '../adapters/llm/ollama'
import runTaskLoop from './taskLoop'

describe('TaskLoop (integration with OpenCode & Ollama)', () => {
  test('simple agent-llm run completes (ping)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'taskloop-'))

    // ensure port is free (best-effort)
    try {
      execSync('lsof -ti:3780 | xargs kill -9 || true')
    } catch (e) {
      // ignore
    }

    const agent = await createOpenCodeAgentAdapter(3780, tmp)
    const llm = createOllamaAdapter({})

    try {
      const task = 'Respond with the single word: ping'
      const res = await runTaskLoop({ task, agent, llm, workDir: tmp, maxIterations: 4 })

      expect(res).toBeDefined()
      expect(Array.isArray(res.steps)).toBe(true)
      expect(res.steps.length).toBeGreaterThan(0)
      expect(fs.existsSync(res.artifactsPath)).toBe(true)
    } finally {
      await agent.stop()
    }
  }, 120000)

  test('multi-iteration agent run (3 steps) completes', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'taskloop-'))
    try {
      execSync('lsof -ti:3780 | xargs kill -9 || true')
    } catch (e) {}

    const agent = await createOpenCodeAgentAdapter(3780, tmp)
    const llm = createOllamaAdapter({})

    try {
      const task =
        'In three iterations, reply exactly: iteration-1, then iteration-2, then iteration-3. Only one iteration per call.'
      const res = await runTaskLoop({ task, agent, llm, workDir: tmp, maxIterations: 6 })

      expect(res).toBeDefined()
      expect(res.steps.length).toBeGreaterThanOrEqual(2)
      expect(fs.existsSync(res.artifactsPath)).toBe(true)
    } finally {
      await agent.stop()
    }
  }, 180000)
})

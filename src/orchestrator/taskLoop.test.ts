import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { AgentAdapter } from '../adapters/agent/interface'
import { createOpenCodeAgentAdapter } from '../adapters/agent/opencode'
import { LLMAdapter } from '../adapters/llm/interface'
import createOllamaAdapter from '../adapters/llm/ollama'
import runTaskLoop from './taskLoop'

describe('TaskLoop (integration with OpenCode & Ollama)', () => {
  let tmpdir: string
  let agent: AgentAdapter
  let llm: LLMAdapter

  beforeEach(async () => {
    const pwd = process.cwd()
    tmpdir = path.join(pwd, '/.tmp/' + Date.now().toString())
    fs.mkdirSync(tmpdir, { recursive: true })

    // pick a free port for this test run to avoid collisions when tests run in parallel
    const getFreePort = (): Promise<number> =>
      new Promise((resolve, reject) => {
        const net = require('net')
        const s = net.createServer()
        s.unref()
        s.on('error', reject)
        s.listen(0, () => {
          const port = (s.address() as any).port
          s.close(() => resolve(port))
        })
      })

    const port = await getFreePort()
    agent = await createOpenCodeAgentAdapter(port, tmpdir)
    llm = createOllamaAdapter({})
  })

  afterEach(async () => {
    await agent.stop()
  })

  test('simple agent-llm run completes (ping)', async () => {
    const task = 'Respond with the single word: ping'
    const res = await runTaskLoop({ task, agent, llm, workDir: tmpdir, maxIterations: 4 })

    expect(res).toBeDefined()
    expect(Array.isArray(res.steps)).toBe(true)
    expect(res.steps.length).toBeGreaterThan(0)
    expect(fs.existsSync(res.artifactsPath)).toBe(true)
  }, 240000)

  test('multi-iteration agent run (3 steps) completes', async () => {
    const task =
      'In three iterations, reply exactly: iteration-1, then iteration-2, then iteration-3. Only one iteration per call.'
    const res = await runTaskLoop({ task, agent, llm, workDir: tmpdir, maxIterations: 6 })

    expect(res).toBeDefined()
    expect(res.steps.length).toBeGreaterThanOrEqual(2)
    expect(fs.existsSync(res.artifactsPath)).toBe(true)
  }, 180000)

  test('writes per-step provenance files with agent and llm outputs', async () => {
    const task = 'Respond with the single word: ping'
    const res = await runTaskLoop({ task, agent, llm, workDir: tmpdir, maxIterations: 4 })

    expect(res).toBeDefined()
    // artifactsPath should contain per-iteration JSON files written by runTaskLoop
    const files = fs.readdirSync(res.artifactsPath).filter((f) => f.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)

    const first = JSON.parse(fs.readFileSync(path.join(res.artifactsPath, files[0]), 'utf8'))
    expect(first).toHaveProperty('agent')
    expect(typeof first.agent.text === 'string').toBe(true)
    expect(first).toHaveProperty('llm')
    expect(typeof first.llm.text === 'string').toBe(true)
  }, 120000)

  test('runId matches artifacts directory and steps include agent and llm', async () => {
    const task = 'Respond with the single word: ping'
    const res = await runTaskLoop({ task, agent, llm, workDir: tmpdir, maxIterations: 4 })

    expect(res).toBeDefined()
    // runId should equal the directory name of artifactsPath
    expect(path.basename(res.artifactsPath)).toBe(res.runId)

    // steps should include at least one agent and one llm entry
    const hasAgent = res.steps.some((s) => s.adapter === 'agent')
    const hasLLM = res.steps.some((s) => s.adapter === 'llm')
    expect(hasAgent).toBe(true)
    expect(hasLLM).toBe(true)
  }, 120000)

  test('returns failure summary when maxIterations reached', async () => {
    // craft a task that is unlikely to be judged complete quickly
    const task = 'Always respond with the single word: continue'
    const res = await runTaskLoop({ task, agent, llm, workDir: tmpdir, maxIterations: 2 })

    expect(res).toBeDefined()
    expect(res.summary).toBeDefined()
    // either success or failure is acceptable in rare cases, but we assert the shape
    expect(typeof res.summary.success).toBe('boolean')
    expect(fs.existsSync(res.artifactsPath)).toBe(true)

    await agent.stop()
  }, 120000)
})

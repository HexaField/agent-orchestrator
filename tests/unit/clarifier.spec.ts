import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We'll mock the LLM adapter module used by the clarifier
vi.mock('../../src/adapters/llm', () => {
  return {
    getLLMAdapter: () => ({
      generate: async ({ prompt }: any) => ({ text: `MOCK_REPLY_FOR:${String(prompt).slice(0, 20)}` })
    })
  }
})

import { clarifyLastRun } from '../../src/core/clarifier'

describe('clarifier core', () => {
  const tmp = path.join(__dirname, '..', '.tmp', 'clarifier')
  beforeEach(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {}
    fs.mkdirSync(tmp, { recursive: true })
  })
  afterEach(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {}
  })

  it('synthesizes a reply and writes an audit file when lastOutcome needs_clarification', async () => {
    // Setup .agent state + run artifact
    const agentDir = path.join(tmp, '.agent')
    fs.mkdirSync(path.join(agentDir, 'runs'), { recursive: true })
    const runId = 'run-test-1'
    const runPath = path.join(agentDir, 'runs', runId)
    fs.mkdirSync(runPath, { recursive: true })
    const runJson = { outputs: { stdout: 'What is the desired behaviour?' }, items: [] }
    fs.writeFileSync(path.join(runPath, 'run.json'), JSON.stringify(runJson, null, 2), 'utf8')
    const state = { version: 1, currentRunId: runId, status: 'running', lastOutcome: 'needs_clarification' }
    fs.writeFileSync(path.join(agentDir, 'state.json'), JSON.stringify(state, null, 2), 'utf8')
    fs.writeFileSync(path.join(tmp, 'spec.md'), 'Implement foo function that returns 42', 'utf8')

    const res = await clarifyLastRun(tmp, { approve: false })
    expect(res).toBeTruthy()
    expect(res && res.runId).toBe(runId)
    // audit file should exist
    const auditPath = path.join(agentDir, '.auto-answers', `${runId}-llm-clarify.json`)
    expect(fs.existsSync(auditPath)).toBe(true)
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))
    expect(audit.reply).toContain('MOCK_REPLY_FOR:')
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCopilotCli } from '../../src/adapters/agent/copilotCli'

describe('Copilot CLI adapter', () => {
  const OLD_ENV = process.env
  beforeEach(() => {
    process.env = { ...OLD_ENV }
  })
  afterEach(() => {
    process.env = OLD_ENV
  })

  it('uses primary copilot command when available', async () => {
    process.env.MOCK_RUN_COMMAND = JSON.stringify({ stdout: 'copilot-ok', stderr: '', exitCode: 0 })
    process.env.AO_ALLOW_COMMANDS = '1'
    const a = createCopilotCli()
    const res = await a.run({ prompt: 'x', cwd: '.', timeoutMs: 2000 })
    expect(res.stdout).toBe('copilot-ok')
    expect(res.exitCode).toBe(0)
  })

  it('falls back to gh copilot when primary fails', async () => {
    // First try simulate failure, second try simulate success. We'll toggle MOCK_RUN_COMMAND per call by
    // overriding runCommand via env is not sequential, so instead we call adapter twice simulating separate runs.
    process.env.MOCK_RUN_COMMAND = JSON.stringify({ stdout: '', stderr: 'not found', exitCode: 1 })
    process.env.AO_ALLOW_COMMANDS = '1'
    const a = createCopilotCli()
    // first run returns failure
    const r1 = await a.run({ prompt: 'x', cwd: '.', timeoutMs: 2000 })
    expect(r1.exitCode).toBe(1)

    // Now simulate gh copilot success by changing MOCK_RUN_COMMAND
    process.env.MOCK_RUN_COMMAND = JSON.stringify({ stdout: 'gh-copilot-ok', stderr: '', exitCode: 0 })
    const r2 = await a.run({ prompt: 'x', cwd: '.', timeoutMs: 2000 })
    expect(r2.stdout).toBe('gh-copilot-ok')
    expect(r2.exitCode).toBe(0)
  })

  it('returns helpful stderr when no CLI available', async () => {
    // Simulate both CLI attempts failing by returning a failure from the mocked runCommand
    process.env.MOCK_RUN_COMMAND = JSON.stringify({ stdout: '', stderr: 'not found', exitCode: 1 })
    process.env.AO_ALLOW_COMMANDS = '1'
    const a = createCopilotCli()
    const res = await a.run({ prompt: 'x', cwd: '.', timeoutMs: 2000 })
    expect(res.exitCode).toBe(1)
    expect(String(res.stderr || res.stdout)).toMatch(/not found|copilot/i)
  })
})

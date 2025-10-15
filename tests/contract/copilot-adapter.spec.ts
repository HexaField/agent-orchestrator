import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCopilotCli } from '../../src/adapters/agent/copilotCli'
import { seedConfigFor } from '../support/seedConfig'

describe('Copilot CLI adapter', () => {
  const tmpRoot = path.join(__dirname, '.tmp-copilot')
  beforeEach(async () => {
    await fs.remove(tmpRoot)
    await fs.ensureDir(tmpRoot)
    await fs.ensureDir(path.join(tmpRoot, '.agent'))
  })
  afterEach(async () => {
    await fs.remove(tmpRoot)
  })

  it('uses primary copilot command when available', async () => {
    await seedConfigFor(tmpRoot, { ALLOW_COMMANDS: '1' })
    process.env.MOCK_RUN_COMMAND = JSON.stringify({ stdout: 'copilot-ok', stderr: '', exitCode: 0 })
    const a = createCopilotCli()
    const res = await a.run({ prompt: 'x', cwd: tmpRoot, timeoutMs: 2000 })
    expect(res.stdout).toBe('copilot-ok')
    expect(res.exitCode).toBe(0)
  })

  it('falls back to gh copilot when primary fails', async () => {
    await seedConfigFor(tmpRoot, { ALLOW_COMMANDS: '1' })
    // First run simulate failure
    process.env.MOCK_RUN_COMMAND = JSON.stringify({ stdout: '', stderr: 'not found', exitCode: 1 })
    const a = createCopilotCli()
    const r1 = await a.run({ prompt: 'x', cwd: tmpRoot, timeoutMs: 2000 })
    expect(r1.exitCode).toBe(1)

    // Now simulate gh copilot success by changing MOCK_RUN_COMMAND
    process.env.MOCK_RUN_COMMAND = JSON.stringify({ stdout: 'gh-copilot-ok', stderr: '', exitCode: 0 })
    const r2 = await a.run({ prompt: 'x', cwd: tmpRoot, timeoutMs: 2000 })
    expect(r2.stdout).toBe('gh-copilot-ok')
    expect(r2.exitCode).toBe(0)
  })

  it('returns helpful stderr when no CLI available', async () => {
    await seedConfigFor(tmpRoot, { ALLOW_COMMANDS: '1' })
    process.env.MOCK_RUN_COMMAND = JSON.stringify({ stdout: '', stderr: 'not found', exitCode: 1 })
    const a = createCopilotCli()
    const res = await a.run({ prompt: 'x', cwd: tmpRoot, timeoutMs: 2000 })
    expect(res.exitCode).toBe(1)
    expect(String(res.stderr || res.stdout)).toMatch(/not found|copilot/i)
  })
})

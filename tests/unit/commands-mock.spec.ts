import fs from 'fs-extra'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Provide a top-level mock for child_process.exec so dynamic imports inside
// the orchestrator pick up the mocked function during tests.
const execMock = vi.fn((cmd: any, opts: any, cb: any) => cb && cb(null, { stdout: '', stderr: '' }))
vi.mock('child_process', () => ({ exec: execMock }))

describe('responseType commands (mocked)', () => {
  const tmp = path.join(__dirname, '.tmp-cmd-mock')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent', 'runs'))
    await fs.writeFile(path.join(tmp, 'spec.md'), '# Spec')
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.remove(tmp)
    delete process.env.AO_ALLOW_COMMANDS
  })

  it('does not run commands when AO_ALLOW_COMMANDS!=1 and mocks exec when enabled', async () => {
    // First, ensure commands are not executed when gate is off
    const touch = `node -e "require('fs').writeFileSync('cmd.txt','no')"`
    // import runOnce dynamically to avoid interfering with vi.mock later
    const { runOnce } = await import('../../src/core/orchestrator')
    await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: touch })
    expect(await fs.pathExists(path.join(tmp, 'cmd.txt'))).toBe(false)

    // Now mock child_process.exec and enable commands
  process.env.AO_ALLOW_COMMANDS = '1'

  const touch2 = `node -e \"require('fs').writeFileSync('cmd2.txt','ok')\"`
  // re-import runOnce (dynamic import inside test ensures orchestrator will dynamic-import our mocked module)
  const { runOnce: runOnce2 } = await import('../../src/core/orchestrator')
  await runOnce2(tmp, { llm: 'passthrough', agent: 'custom', prompt: touch2 })

  // Because exec was mocked at module level, the file should not actually be created, but exec should have been called
  expect(execMock).toHaveBeenCalled()
    expect(await fs.pathExists(path.join(tmp, 'cmd2.txt'))).toBe(false)
  })
})

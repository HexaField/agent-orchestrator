import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedEmptyProgress } from '../support/createProgress'

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
    await seedEmptyProgress(tmp)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.remove(tmp)
  })

  it('runs commands (exec mocked) and records invocation', async () => {
    // Commands execute unconditionally; ensure runOnce invokes the exec path
    const touch = `node -e "require('fs').writeFileSync('cmd.txt','no')"`
    // import runOnce dynamically to avoid interfering with vi.mock later
    const mod = (await import('../../src/core/orchestrator')) as any
    const runOnce = mod.runOnce as any
    await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: touch })

    // Because exec was mocked at module level, the file should not actually be created, but exec should have been called
    expect(execMock).toHaveBeenCalled()
  })
})

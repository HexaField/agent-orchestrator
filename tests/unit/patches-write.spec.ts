import fs from 'fs-extra'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runOnce } from '../../src/core/orchestrator'

describe('patches output', () => {
  const tmp = path.join(__dirname, '.tmp-patches-write')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
    // remove any stray lock from previous runs
    try {
      await fs.remove(path.join(tmp, '.agent', 'lock'))
    } catch {}
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('writes patches.diff when responseType=patches and agent emits PATCH:', async () => {
    process.env.AO_RESPONSE_TYPE = 'patches'
    process.env.AO_SKIP_VERIFY = '1'
    const res = await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: 'PATCH: ---\n+a file\n', force: true })
    const runPath = path.join(tmp, '.agent', 'runs', res.runId, 'patches.diff')
    const exists = await fs.pathExists(runPath)
    expect(exists).toBe(true)
    const content = await fs.readFile(runPath, 'utf8')
    expect(content).toContain('+a file')
    delete process.env.AO_RESPONSE_TYPE
  })
})

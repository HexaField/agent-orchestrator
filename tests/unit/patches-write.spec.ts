import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runOnce } from '../../src/core/orchestrator'
import { seedConfigFor } from '../support/seedConfig'

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
  await seedConfigFor(tmp, { RESPONSE_TYPE: 'patches', SKIP_VERIFY: '1' })
    const res = await runOnce(tmp, {
      llm: 'passthrough',
      agent: 'custom',
      prompt: 'PATCH: ---\n+a file\n',
      force: true
    })
    const runPath = path.join(tmp, '.agent', 'runs', res.runId, 'patches.diff')
    const exists = await fs.pathExists(runPath)
    expect(exists).toBe(true)
    const content = await fs.readFile(runPath, 'utf8')
    expect(content).toContain('+a file')
    // cleanup by removing tmp in afterEach
  })
})

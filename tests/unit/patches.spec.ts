import fs from 'fs-extra'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runOnce } from '../../src/core/orchestrator'

describe('patches output handling', () => {
  const tmp = path.join(__dirname, '.tmp-patches-handling')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
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
    const prompt = 'PATCH:\ndiff --git a/file b/file\n+hello'
    const res = await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt, force: true })
    expect(res).toHaveProperty('runId')
    const patchPath = path.join(tmp, '.agent', 'runs', res.runId, 'patches.diff')
    const has = await fs.pathExists(patchPath)
    expect(has).toBe(true)
    const content = await fs.readFile(patchPath, 'utf8')
    expect(content).toContain('diff --git')
    delete process.env.AO_RESPONSE_TYPE
  })
})

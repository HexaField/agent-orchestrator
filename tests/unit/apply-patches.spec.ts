import fs from 'fs-extra'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { applyPatchesFromRun } from '../../src/core/patches'

describe('apply patches helper', () => {
  const tmp = path.join(__dirname, '.tmp-apply')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent', 'runs', 'run-test'))
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('creates applied.marker fallback when git apply fails', async () => {
    const p = path.join(tmp, '.agent', 'runs', 'run-test', 'patches.diff')
    await fs.writeFile(p, 'diff --git a/x b/x\n+hello', 'utf8')
    const res = await applyPatchesFromRun(tmp, 'run-test')
    // since git apply likely fails in this environment, ensure fallback marker exists
    if (!res.applied) {
      expect(res.path).toBeTruthy()
      expect(String(res.path)).toContain('applied.marker')
      const content = await fs.readFile(String(res.path), 'utf8')
      expect(content).toContain('failed-to-apply')
    } else {
      // if it applied successfully (rare), ensure path is the patch
      expect(res.path).toContain('patches.diff')
    }
  })
})

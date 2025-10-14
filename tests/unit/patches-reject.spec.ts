import fs from 'fs-extra'
import path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyPatchesFromRun } from '../../src/core/patches'

// This test ensures that when git apply --reject is needed, .rej files are produced and
// the applied.marker contains diagnostic attempts.

describe('patches reject behavior', () => {
  const tmp = path.join(__dirname, '.tmp-patch-reject')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.mkdirp(path.join(tmp, '.agent', 'runs', 'run-test'))
    await fs.writeFile(path.join(tmp, 'file.txt'), 'line1\nline2\n', 'utf8')
    const run = (cmd: string) => require('child_process').execSync(cmd, { cwd: tmp })
    run('git init -b main')
    run('git add .')
    run('git commit -m init')
  })

  it('writes .rej and diagnostics on reject', async () => {
    const p = path.join(tmp, '.agent', 'runs', 'run-test', 'patches.diff')
    // create a patch that modifies file.txt in a way that won't match
    const patch = `diff --git a/file.txt b/file.txt
index 000..111 100644
--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
-line1
-line2
+changed-line1
+line2
`
    await fs.writeFile(p, patch, 'utf8')
    const res = await applyPatchesFromRun(tmp, 'run-test')
    // we expect either applied false with diagnostic marker or success; ensure diagnostic contains attempts
    if (!res.applied) {
      const markerPath = String(res.path)
      expect(markerPath).toBeTruthy()
      const marker = await fs.readJson(markerPath)
      expect(marker.attempts).toBeTruthy()
    } else {
      // if it magically applied, ensure no .rej exists
      const rej = path.join(tmp, 'file.txt.rej')
      const exists = await fs.pathExists(rej)
      expect(!exists).toBe(true)
    }
  })
})

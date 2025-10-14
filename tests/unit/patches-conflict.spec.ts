import fs from 'fs-extra'
import path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyPatchesFromRun } from '../../src/core/patches'

// This test crafts a conflict by creating divergent commits and a patch that will fail a three-way merge.

describe('patches conflict behavior', () => {
  const tmp = path.join(__dirname, '.tmp-patch-conflict')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.mkdirp(path.join(tmp, '.agent', 'runs', 'run-test'))
    await fs.writeFile(path.join(tmp, 'conf.txt'), 'base\n', 'utf8')
    const run = (cmd: string) => require('child_process').execSync(cmd, { cwd: tmp })
    run('git init -b main')
    run('git add .')
    run('git commit -m init')
    // create a new commit changing conf.txt
    await fs.writeFile(path.join(tmp, 'conf.txt'), 'ours\n', 'utf8')
    run('git add .')
    run('git commit -m ours')
    // create an alternate branch and change file differently
    run('git checkout -b other')
    await fs.writeFile(path.join(tmp, 'conf.txt'), 'theirs\n', 'utf8')
    run('git add .')
    run('git commit -m theirs')
    run('git checkout main')
  })

  it('records conflicts and diagnostics', async () => {
    const p = path.join(tmp, '.agent', 'runs', 'run-test', 'patches.diff')
    // create a patch that represents the 'theirs' change applied against base
    const patch = `diff --git a/conf.txt b/conf.txt
index 000..111 100644
--- a/conf.txt
+++ b/conf.txt
@@ -1 +1 @@
-base
+theirs
`
    await fs.writeFile(p, patch, 'utf8')
    const res = await applyPatchesFromRun(tmp, 'run-test')
    expect(res.applied).toBe(false)
    const markerPath = String(res.path)
    const marker = await fs.readJson(markerPath)
    expect(marker.attempts).toBeTruthy()
    // conflict files like .rej or conflict markers may exist
  })
})

import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyPatchesFromRun } from '../../src/core/patches'

// This test ensures that if applying patches fails, the working tree and index are left clean
// and no partial changes remain (transactional behavior).

describe('apply patches rollback behavior', () => {
  const tmp = path.join(__dirname, '.tmp-apply-rollback')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    // init a git repo
    await fs.writeFile(path.join(tmp, 'README.md'), 'initial', 'utf8')
    await fs.mkdirp(path.join(tmp, '.agent', 'runs', 'run-test'))
    // Git doesn't track empty directories; add a placeholder so .agent is part of the initial commit
    await fs.writeFile(path.join(tmp, '.agent', '.keep'), '', 'utf8')
    const run = (cmd: string) => require('child_process').execSync(cmd, { cwd: tmp })
    run('git init -b main')
    run('git add .')
    run('git commit -m init')
  })

  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('does not leave half-applied changes after failed apply', async () => {
    const p = path.join(tmp, '.agent', 'runs', 'run-test', 'patches.diff')
    // create a malformed patch that will fail to apply
    const badPatch = `diff --git a/NOFILE b/NOFILE
+this will fail
`
    await fs.writeFile(p, badPatch, 'utf8')

    const res = await applyPatchesFromRun(tmp, 'run-test')
    expect(res.applied).toBe(false)
    // ensure the repo has a clean working tree and no tracked changed files
    const status = require('child_process').execSync('git status --porcelain', { cwd: tmp }).toString().trim()
    // Accept untracked .agent/runs/ (test artefact), but ensure there are no staged/modified/tracked changes
    if (status === '') return
    const lines = status.split(/\r?\n/).filter(Boolean)
    for (const l of lines) {
      // porcelain: first two chars are status codes; untracked lines start with '??'
      expect(l.startsWith('??')).toBe(true)
      // ensure untracked entries are only under .agent
      expect(l).toContain('.agent')
    }
  })
})

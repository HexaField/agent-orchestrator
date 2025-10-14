import fs from 'fs-extra'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeChangelog } from '../../src/core/changelog'

describe('writeChangelog', () => {
  const tmp = path.join(__dirname, '.tmp-changelog')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(path.join(tmp, '.agent', 'runs'))
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('creates a changelog with run and verification header when run exists', async () => {
    // create a fake run
    const runId = 'run-test'
    const runDir = path.join(tmp, '.agent', 'runs', runId)
    await fs.ensureDir(runDir)
    const runJson = {
      runId,
      startedAt: new Date().toISOString(),
      verification: { lint: 'pass', typecheck: 'pass', tests: { passed: 1, failed: 0 } },
      git: { files: ['a.txt'], diff: 'diff --git a.txt b.txt\n+hello' }
    }
    await fs.writeJson(path.join(runDir, 'run.json'), runJson)

    const rel = await writeChangelog(tmp, 'taskname', 'My changes')
    const abs = path.join(tmp, rel)
    const txt = await fs.readFile(abs, 'utf8')
    expect(txt).toContain('runId: run-test')
    expect(txt).toContain('## Verification')
    expect(txt).toContain('## Git changes')
  })
})

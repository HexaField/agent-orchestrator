import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runOnce } from '../../src/core/orchestrator'
import { seedEmptyProgress } from '../support/createProgress'

describe('responseType semantics and marker edge cases', () => {
  const tmp = path.join(__dirname, '.tmp-response-semantics')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent', 'runs'))
    await seedEmptyProgress(tmp)
    await fs.writeFile(path.join(tmp, 'spec.md'), '# Spec')
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('ignores empty filename markers and nested markers', async () => {
    const out = `=== good.txt ===\nGood\n=== ===\nShouldBeIgnored\n=== nested.md ===\nStart\n=== inner.txt ===\nInner\n=== another.md ===\nEnd\n`
    await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: out })

    expect(await fs.pathExists(path.join(tmp, 'good.txt'))).toBe(true)
    expect(await fs.pathExists(path.join(tmp, 'nested.md'))).toBe(true)
    // inner.txt should be treated as another top-level marker and created
    expect(await fs.pathExists(path.join(tmp, 'inner.txt'))).toBe(true)
    expect(await fs.pathExists(path.join(tmp, 'another.md'))).toBe(true)
    // empty filename marker should not create a file — verify by listing created files
    const entries = await fs.readdir(tmp)
    // filter out control files/dirs
    const created = entries.filter((e) => e !== '.agent' && e !== 'spec.md')
    expect(created).toContain('good.txt')
    expect(created).toContain('nested.md')
    expect(created).toContain('inner.txt')
    expect(created).toContain('another.md')
    // make sure there's no empty-name entry
    expect(created.includes('')).toBe(false)
  })

  it('handles consecutive markers with no body as empty files', async () => {
    const out = `=== a.txt ===\n=== b.txt ===\nContentB\n=== c.txt ===\n\n`
    await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: out })
    // a.txt should exist but be empty
    expect(await fs.pathExists(path.join(tmp, 'a.txt'))).toBe(true)
    expect((await fs.readFile(path.join(tmp, 'a.txt'), 'utf8')).trim()).toBe('')
    // b and c should exist
    expect(await fs.pathExists(path.join(tmp, 'b.txt'))).toBe(true)
    expect(await fs.pathExists(path.join(tmp, 'c.txt'))).toBe(true)
  })

  it('ignores malformed markers without closing delimiter', async () => {
    const out = `=== ok.md ===\n# OK\n=== malformed\nno close here\n`
    await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: out })
    expect(await fs.pathExists(path.join(tmp, 'ok.md'))).toBe(true)
    // malformed should not create a file named 'malformed'
    expect(await fs.pathExists(path.join(tmp, 'malformed'))).toBe(false)
  })
})

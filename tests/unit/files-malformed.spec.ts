import fs from 'fs-extra'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runOnce } from '../../src/core/orchestrator'

describe('responseType files (malformed markers)', () => {
  const tmp = path.join(__dirname, '.tmp-files-malformed')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent', 'runs'))
    await fs.writeFile(path.join(tmp, 'spec.md'), '# Spec')
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('writes only well-formed markers and ignores malformed/overlaps', async () => {
  // Construct output with well-formed marker, a malformed marker (no closing),
  // and an overlapping marker (empty filename). The malformed marker below is
  // intentionally left without a closing '===' so it should be ignored.
  const out = `=== good.txt ===\nThis is good\n=== malformed\nNo closing marker here\n=== ===\nShould be ignored\n=== another.md ===\n# Another\n`
    await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: out })

    const g = path.join(tmp, 'good.txt')
    const a = path.join(tmp, 'another.md')
  const bad = path.join(tmp, 'malformed')
    // good and another should exist
    expect(await fs.pathExists(g)).toBe(true)
    expect((await fs.readFile(g, 'utf8')).trim()).toContain('This is good')
    expect(await fs.pathExists(a)).toBe(true)
    expect((await fs.readFile(a, 'utf8')).trim()).toContain('# Another')
    // malformed marker and empty filename should not create files
    expect(await fs.pathExists(bad)).toBe(false)
    // tmp directory remains
    expect(await fs.pathExists(path.join(tmp))).toBe(true)
  })
})

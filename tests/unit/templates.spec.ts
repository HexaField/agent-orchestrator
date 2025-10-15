import fs from 'fs-extra'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { genChange, genClarify, genContext, genNext, genResponseType } from '../../src/core/templates'
import { seedConfigFor } from '../support/seedConfig'

describe('templates', () => {
  it('genChange returns NextTask shape', () => {
    const t = genChange()
    expect(t).toHaveProperty('id')
    expect(t).toHaveProperty('title')
    expect(t).toHaveProperty('summary')
    expect(Array.isArray(t.acceptanceCriteria)).toBe(true)
  })

  it('genNext returns NextTask shape', () => {
    const n = genNext()
    expect(n).toHaveProperty('id')
    expect(n).toHaveProperty('title')
    expect(n).toHaveProperty('summary')
    expect(Array.isArray(n.acceptanceCriteria)).toBe(true)
  })

  it('genResponseType respects RESPONSE_TYPE in project config', async () => {
    const tmp = path.join(__dirname, '.tmp-templates')
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
    await seedConfigFor(tmp, { RESPONSE_TYPE: 'patches' })
    const origCwd = process.cwd()
    try {
      process.chdir(tmp)
      expect(await genResponseType()).toBe('patches')
      await seedConfigFor(tmp, { RESPONSE_TYPE: 'files' })
      expect(await genResponseType()).toBe('files')
    } finally {
      process.chdir(origCwd)
      await fs.remove(tmp)
    }
  })

  it('generators use spec text to produce richer outputs', () => {
    const spec = '# Title\n\n## Feature A\n\nDo something\n\n## Feature B\n\nDo another thing'
    const ctx = genContext(spec)
    expect(ctx).toContain('Context summary:')
    const clar = (genClarify as any)(spec)
    expect(clar).toContain("What are the acceptance criteria for 'Feature A'?")
    const change = (genChange as any)(spec, 'tests failed')
    expect(change.summary).toContain('Please update the following')
    expect(change.title).toContain('Changes requested')
  })
})

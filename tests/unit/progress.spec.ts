import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyProgressPatch,
  getStatus,
  readNextTaskAcceptanceCriteria,
  readProgress,
  writeSectionAtomic
} from '../../src/core/progress'

describe('progress API', () => {
  const tmp = path.join(__dirname, '.tmp-progress')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('writes and reads sections atomically', async () => {
    await writeSectionAtomic(tmp, 'Status', 'idle')
    expect(await getStatus(tmp)).toBe('idle')
    await writeSectionAtomic(tmp, 'Clarifications', 'Please clarify X')
    const p = await readProgress(tmp)
    expect(p).toContain('Clarifications')
  })

  it('applies nextTask and reads acceptance criteria', async () => {
    await applyProgressPatch(tmp, {
      nextTask: {
        id: 't1',
        title: 'Next',
        summary: 'Do thing',
        acceptanceCriteria: ['tests pass', 'lint pass'],
        createdAt: new Date().toISOString()
      }
    })
    const ac = await readNextTaskAcceptanceCriteria(tmp)
    expect(ac).toEqual(['tests pass', 'lint pass'])
  })
})

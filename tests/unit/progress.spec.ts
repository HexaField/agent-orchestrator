import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyProgressPatch,
  getStatus,
  readNextTaskAcceptanceCriteria,
  readProgressJson
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

  it('writes and reads sections atomically (json)', async () => {
    await applyProgressPatch(tmp, { status: 'idle' })
    expect(await getStatus(tmp)).toBe('idle')
    await applyProgressPatch(tmp, { clarifications: 'Please clarify X' })
    const p = await readProgressJson(tmp)
    expect(p.clarifications).toBe('Please clarify X')
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

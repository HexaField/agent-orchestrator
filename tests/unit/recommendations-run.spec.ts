import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runOnce, setState } from '../../src/core/orchestrator'
import { seedConfigFor } from '../support/seedConfig'

describe('recommendations are used in run inputs', () => {
  const tmp = path.join(__dirname, '.tmp-recommend')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('includes nextTask/recommendations in inputs when nextTask is set', async () => {
    // seed a nextTask in state
    await setState(tmp, {
      nextTask: {
        id: 't1',
        title: 'Change X',
        summary: 'Please do X',
        acceptanceCriteria: ['X'],
        createdAt: new Date().toISOString()
      }
    } as any)
    await seedConfigFor(tmp, { SKIP_VERIFY: '1' })
    const res = await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: 'implement', force: true })
    expect(res.inputs).toBeDefined()
    expect(Array.isArray(res.inputs.contextPrompts)).toBe(true)
    const ctx = res.inputs.contextPrompts.join('\n')
    expect(ctx).toContain('Recommendations')
    expect(ctx).toContain('Change X')
  })
})

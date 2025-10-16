import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getState, runOnce, setState } from '../../src/core/orchestrator'
import { seedEmptyProgress } from '../support/createProgress'

describe('orchestrator approval gating', () => {
  const tmp = path.join(__dirname, '.tmp-approval')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await seedEmptyProgress(tmp)
    // initialize .agent dir and state
    await fs.ensureDir(path.join(tmp, '.agent'))
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('should block run when awaiting_approval unless forced', async () => {
    await setState(tmp, { status: 'awaiting_approval' } as any)
    // attempt without force -> should throw
    await expect(runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: 'x' })).rejects.toThrow(
      /awaiting human approval/
    )
    // attempt with force -> should proceed
    const res = await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: 'x', force: true })
    expect(res).toHaveProperty('runId')
    const st = await getState(tmp)
    expect(st.status).not.toBe('awaiting_approval')
  })
})

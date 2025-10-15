import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import reviewCmd from '../../src/cli/commands/review'
import { getState } from '../../src/core/orchestrator'
import { readProgress } from '../../src/core/progress'
import { seedConfigFor } from '../support/seedConfig'

describe('review command', () => {
  const tmp = path.join(__dirname, '.tmp-review')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('request-changes writes Recommendations and sets changes_requested', async () => {
    await reviewCmd.parseAsync(['node', 'review', '--cwd', tmp, '--request-changes'], { from: 'user' })
    const progress = await readProgress(tmp)
    expect(progress).toContain('Recommendations')
    const st = await getState(tmp)
    expect(st.status).toBe('changes_requested')
    expect(st.nextTask).toBeTruthy()
    expect(st.nextTask?.title).toContain('Recommended')
  })

  it('uses LLM-backed genChange when USE_LLM_GEN=1', async () => {
    await seedConfigFor(tmp, { USE_LLM_GEN: '1', LLM_PROVIDER: 'passthrough' })
    await reviewCmd.parseAsync(['node', 'review', '--cwd', tmp, '--request-changes'], { from: 'user' })
    const progress = await readProgress(tmp)
    // passthrough provider will echo the prompt text, so Recommendations should contain "Spec:" or similar
    expect(progress).toContain('Recommendations')
    const st = await getState(tmp)
    expect(st.nextTask).toBeTruthy()
  })
})

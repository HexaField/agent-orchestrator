import fs from 'fs-extra'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import reviewCmd from '../../src/cli/commands/review'
import { readProgress } from '../../src/core/progress'
import { getState } from '../../src/core/orchestrator'

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
})

import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import presentCmd from '../../src/cli/commands/present'
import { getState } from '../../src/core/orchestrator'

describe('present CLI', () => {
  const tmp = path.join(__dirname, '.tmp-present')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
    await fs.writeFile(
      path.join(tmp, 'progress.json'),
      JSON.stringify({ status: 'idle', checklist: [] }, null, 2),
      'utf8'
    )
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('prints progress and sets awaiting_approval when --approve', async () => {
    await presentCmd.parseAsync(['node', 'present', '--cwd', tmp, '--approve'], { from: 'user' })
    const st = await getState(tmp)
    expect(st.status).toBe('awaiting_approval')
  })
})

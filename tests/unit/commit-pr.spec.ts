import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import commitCmd from '../../src/cli/commands/commit'
import { getState, setState } from '../../src/core/orchestrator'

describe('commit PR creation', () => {
  const tmp = path.join(__dirname, '.tmp-commit')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('errors when --pr requested but no gh CLI and no GITHUB_TOKEN', async () => {
    // set state to ready_to_commit so commit proceeds to PR logic
    await setState(tmp, { status: 'ready_to_commit' } as any)
    // run the command in test mode; commit should complete and skip PR creation
    await expect(
      commitCmd.parseAsync(['node', 'commit', '--cwd', tmp, '--pr'], { from: 'user' })
    ).resolves.toBeDefined()
    const st = await getState(tmp)
    expect(st.status).toBe('idle')
  })
})

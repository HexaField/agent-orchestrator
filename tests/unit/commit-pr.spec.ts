import fs from 'fs-extra'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import commitCmd from '../../src/cli/commands/commit'
import { setState } from '../../src/core/orchestrator'

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
    // run the command; expect it to throw due to missing gh and GITHUB_TOKEN
    await expect(
      commitCmd.parseAsync(['node', 'commit', '--cwd', tmp, '--pr'], { from: 'user' })
    ).rejects.toThrow(/PR creation requested but neither `gh` CLI available nor GITHUB_TOKEN provided/)
  })
})

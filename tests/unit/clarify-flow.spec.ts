import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import clarifyCmd from '../../src/cli/commands/clarify'
import { getState, runOnce } from '../../src/core/orchestrator'
import { readProgress } from '../../src/core/progress'
import { seedConfigFor } from '../support/seedConfig'

describe('clarification flow', () => {
  const tmp = path.join(__dirname, '.tmp-clarify')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('run writes clarifications when agent requests them', async () => {
  await seedConfigFor(tmp, { SKIP_VERIFY: '1' })
    // Use a prompt that triggers the custom agent to return 'Needs Clarification'
    const res = await runOnce(tmp, {
      llm: 'passthrough',
      agent: 'custom',
      prompt: 'this run needs clarification',
      force: true
    })
    expect(res.whatDone).toBe('needs_clarification')
    const progress = await readProgress(tmp)
    expect(progress).toContain('Clarifications')
  })

  it('clarify CLI applies clarifications and sets awaiting_approval when --approve', async () => {
    const text = 'Answers to clarifying questions.'
    await clarifyCmd.parseAsync(['node', 'clarify', '--cwd', tmp, '--text', text, '--approve'], { from: 'user' })
    const progress = await readProgress(tmp)
    expect(progress).toContain(text)
    const st = await getState(tmp)
    expect(st.status).toBe('awaiting_approval')
  })
})

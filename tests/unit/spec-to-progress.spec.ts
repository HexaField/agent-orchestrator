import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import specToProgress from '../../src/cli/commands/spec-to-progress'

describe('spec-to-progress CLI', () => {
  it('applies progress patch from spec.md', async () => {
    const d = path.join(tmpdir(), 'agent-spec-to-progress-test-' + Date.now())
    await fs.mkdir(d, { recursive: true })
    await fs.writeFile(path.join(d, 'spec.md'), 'Implement the feature as described', 'utf8')

    // call the command via commander to exercise argument parsing
    await (specToProgress as any).parseAsync(['node', 'spec-to-progress', '--cwd', d])
    const progress = await fs.readFile(path.join(d, 'progress.json'), 'utf8')
    const doc = JSON.parse(progress)
    expect(/awaiting_review|needs_clarification|idle|changes_requested/i.test(doc.status || '')).toBe(true)
  })
})

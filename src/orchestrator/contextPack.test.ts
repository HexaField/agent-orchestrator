import { describe, test, expect, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import progressApi from './progress'
import { buildContextPack } from './contextPack'

const RUN_ID = 'ctxpack-test-run'
const RUN_DIR = path.join(process.cwd(), '.agent', 'run', RUN_ID)

async function cleanup() {
  try {
    await fs.rm(RUN_DIR, { recursive: true, force: true })
  } catch {}
}

afterEach(async () => {
  await cleanup()
})

describe('contextPack', () => {
  test('builds pack with progress and provenance', async () => {
    await cleanup()
    await progressApi.initProgress(RUN_ID, 'specs/example.md')
    // add a task to progress
    await progressApi.updateProgress(RUN_ID, { tasks: [{ id: 't1', title: 'Do thing', type: 'meta', status: 'pending' }] } as any)
    // create provenance dir and two files
    const provDir = path.join(RUN_DIR, 'provenance')
    await fs.mkdir(provDir, { recursive: true })
    await fs.writeFile(path.join(provDir, '001-agent.json'), JSON.stringify({ out: 'a' }))
    await fs.writeFile(path.join(provDir, '002-llm.json'), JSON.stringify({ out: 'b' }))

    const cp = await buildContextPack(RUN_ID, { maxProvenance: 5 })
    expect(cp.runId).toBe(RUN_ID)
    expect(cp.spec).toBe('specs/example.md')
    expect(Array.isArray(cp.recentProvenance)).toBe(true)
    expect(cp.recentProvenance.length).toBeGreaterThanOrEqual(2)
    expect(cp.tasks).toBeDefined()
  })
})

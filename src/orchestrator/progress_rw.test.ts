import { describe, test, expect, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import progressApi from './progress'

const RUN_ID = 'test-run-rw'
const RUN_DIR = path.join(process.cwd(), '.agent', 'run', RUN_ID)

async function cleanup() {
  try {
    await fs.rm(RUN_DIR, { recursive: true, force: true })
  } catch {}
}

afterEach(async () => {
  await cleanup()
})

describe('progress read/write', () => {
  test('initProgress and readProgress create and read the file', async () => {
    await cleanup()
    const init = await progressApi.initProgress(RUN_ID, 'specs/x.md')
    expect(init.runId).toBe(RUN_ID)
    const read = await progressApi.readProgress(RUN_ID)
    expect(read).not.toBeNull()
    expect(read!.spec).toBe('specs/x.md')
  })

  test('updateProgress merges patch and writes audit log', async () => {
    await cleanup()
    await progressApi.initProgress(RUN_ID)
    const patched = await progressApi.updateProgress(RUN_ID, {
      phase: 'implement',
      tasks: [
        { id: 't1', title: 'First', type: 'meta', status: 'pending' },
      ],
    } as any)
    expect(patched.phase).toBe('implement')
    expect(Array.isArray(patched.tasks)).toBe(true)
    const auditPath = path.join(RUN_DIR, 'progress.audit.log')
    const auditExists = await fs.stat(auditPath)
    expect(auditExists).toBeDefined()
    const content = await fs.readFile(auditPath, 'utf8')
    expect(content.trim().length).toBeGreaterThan(0)
  })
})

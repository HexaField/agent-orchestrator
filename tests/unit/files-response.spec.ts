import fs from 'fs-extra'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runOnce } from '../../src/core/orchestrator'

describe('responseType files', () => {
  const tmp = path.join(__dirname, '.tmp-files')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent', 'runs'))
    // create spec.md just to satisfy run
    await fs.writeFile(path.join(tmp, 'spec.md'), '# Spec')
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('writes files from agent stdout markers', async () => {
    // craft a prompt that the custom agent will echo as patch markers
    const fileOut = '=== hello.txt ===\nHello World\n=== dir/note.md ===\n# Note\nContent'
    // run with agent custom and llm passthrough so agent receives prompt
  await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: fileOut })
    // files should be written
    const f1 = path.join(tmp, 'hello.txt')
    const f2 = path.join(tmp, 'dir', 'note.md')
    expect(await fs.pathExists(f1)).toBe(true)
    expect(await fs.readFile(f1, 'utf8')).toContain('Hello World')
    expect(await fs.pathExists(f2)).toBe(true)
    expect(await fs.readFile(f2, 'utf8')).toContain('# Note')
  })
})

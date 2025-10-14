import { execa } from 'execa'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'

function tmpDir(prefix: string) {
  return mkdtempSync(path.join(os.tmpdir(), prefix))
}

describe('E2E Scenario A (happy path)', () => {
  const cwd = tmpDir('ao-')
  const cli = path.resolve(__dirname, '../../bin/agent-orchestrator')

  beforeAll(() => {
    writeFileSync(path.join(cwd, 'spec.md'), '# Title')
  })

  it('init creates .agent and progress', async () => {
    await execa('node', [cli, 'init', '--cwd', cwd])
    const prog = readFileSync(path.join(cwd, 'progress.md'), 'utf8')
    expect(prog).toContain('CHECKLIST:BEGIN')
  })

  it('run produces run.json and awaiting_review when spec implemented', async () => {
    await execa(
      'node',
      [cli, 'run', '--cwd', cwd, '--agent', 'custom', '--llm', 'passthrough', '--prompt', 'Spec implemented'],
      { env: { ...process.env, AO_SKIP_VERIFY: '1' } }
    )
    const state = JSON.parse(readFileSync(path.join(cwd, '.agent', 'state.json'), 'utf8'))
    expect(state.status).toBeDefined()
    const prog = readFileSync(path.join(cwd, 'progress.md'), 'utf8')
    expect(prog).toMatch(/## Status[\s\S]*awaiting_review/)
  })
})

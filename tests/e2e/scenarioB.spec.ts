import { execa } from 'execa'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'

function tmpDir(prefix: string) {
  return mkdtempSync(path.join(os.tmpdir(), prefix))
}

describe('E2E Scenario B (needs clarification loop)', () => {
  const cwd = tmpDir('aoB-')
  const cli = path.resolve(__dirname, '../../bin/agent-orchestrator')

  beforeAll(() => {
    writeFileSync(path.join(cwd, 'spec.md'), '# Title')
  })

  it('init ok', async () => {
    await execa('node', [cli, 'init', '--cwd', cwd])
  })

  it('run marks needs_clarification', async () => {
    await execa(
      'node',
      [cli, 'run', '--cwd', cwd, '--agent', 'custom', '--llm', 'passthrough', '--prompt', 'Needs Clarification'],
      { env: { ...process.env, AO_SKIP_VERIFY: '1' } }
    )
    const state = JSON.parse(readFileSync(path.join(cwd, '.agent', 'state.json'), 'utf8'))
    expect(state.status).toBe('needs_clarification')
  })
})

import { execa } from 'execa'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'

function tmpDir(prefix: string) {
  return mkdtempSync(path.join(os.tmpdir(), prefix))
}

describe('E2E Scenario C (changes requested and review gating)', () => {
  const cwd = tmpDir('aoC-')
  const cli = path.resolve(__dirname, '../../bin/agent-orchestrator')

  beforeAll(() => {
    writeFileSync(path.join(cwd, 'spec.md'), '# Title')
  })

  it('init ok', async () => {
    await execa('node', [cli, 'init', '--cwd', cwd])
  })

  it('run spec implemented sets awaiting_review', async () => {
    await execa(
      'node',
      [cli, 'run', '--cwd', cwd, '--agent', 'custom', '--llm', 'passthrough', '--prompt', 'Spec implemented'],
      { env: { ...process.env, AO_SKIP_VERIFY: '1' } }
    )
    const state = JSON.parse(readFileSync(path.join(cwd, '.agent', 'state.json'), 'utf8'))
    expect(state.status).toBe('awaiting_review')
  })

  it('commit should fail before approval', async () => {
    let threw = false
    try {
      await execa('node', [cli, 'commit', '--cwd', cwd, '--branch', 'c1', '--no-pr'])
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })

  it('review approve then commit succeeds', async () => {
    await execa('node', [cli, 'review', '--cwd', cwd, '--approve'])
    await execa('node', [cli, 'commit', '--cwd', cwd, '--branch', 'c2', '--no-pr'])
    const state = JSON.parse(readFileSync(path.join(cwd, '.agent', 'state.json'), 'utf8'))
    expect(state.status).toBe('idle')
  })
})

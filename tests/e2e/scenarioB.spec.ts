import { execa } from 'execa'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startStub } from '../support/llmStub'
import { seedConfigFor } from '../support/seedConfig'

function tmpDir(prefix: string) {
  return mkdtempSync(path.join(os.tmpdir(), prefix))
}

describe('E2E Scenario B (needs clarification loop)', () => {
  const cwd = tmpDir('aoB-')
  const cli = path.resolve(__dirname, '../../bin/agent-orchestrator')

  beforeAll(async () => {
    writeFileSync(path.join(cwd, 'spec.md'), '# Title')
    try {
      const stub = await startStub()
      ;(global as any).__AO_E2E_STUB = stub
    } catch {}
  })

  afterAll(() => {
    const stub: any = (global as any).__AO_E2E_STUB
    if (stub && typeof stub.stop === 'function') void stub.stop()
  })

  it('init ok', async () => {
    await execa('node', [cli, 'init', '--cwd', cwd])
  })

  it('run marks needs_clarification', async () => {
    const stub: any = (global as any).__AO_E2E_STUB
    const stubUrl = stub ? stub.url : undefined
    await seedConfigFor(cwd, { SKIP_VERIFY: '1', AGENT: 'custom', LLM_PROVIDER: 'passthrough', stubUrl })
    const childEnv = { ...process.env, SKIP_VERIFY: '1' }
    await execa(
      'node',
      [cli, 'run', '--cwd', cwd, '--agent', 'custom', '--llm', 'passthrough', '--prompt', 'Needs Clarification'],
      { env: childEnv }
    )
    const state = JSON.parse(readFileSync(path.join(cwd, '.agent', 'state.json'), 'utf8'))
    expect(state.status).toBe('needs_clarification')
  })
})

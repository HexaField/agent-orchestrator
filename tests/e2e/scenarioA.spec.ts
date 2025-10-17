import { execa } from 'execa'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startStub } from '../support/llmStub'
import { seedConfigFor } from '../support/seedConfig'

function tmpDir(prefix: string) {
  return mkdtempSync(path.join(os.tmpdir(), prefix))
}

describe('E2E Scenario A (happy path)', () => {
  const cwd = tmpDir('ao-')
  const cli = path.resolve(__dirname, '../../bin/agent-orchestrator')
  beforeAll(async () => {
    // create spec and start local LLM stub for this scenario
    writeFileSync(path.join(cwd, 'spec.md'), '# Title')
    try {
      const stub = await startStub()
      ;(global as any).__E2E_STUB = stub
    } catch {}
  })

  afterAll(() => {
    const stub: any = (global as any).__E2E_STUB
    if (stub && typeof stub.stop === 'function') void stub.stop()
  })

  it('init creates .agent and progress', async () => {
    await execa('node', [cli, 'init', '--cwd', cwd])
    const prog = readFileSync(path.join(cwd, 'progress.json'), 'utf8')
    expect(prog).toContain('CHECKLIST:BEGIN')
  })

  it('run produces run.json and awaiting_review when spec implemented', async () => {
    const stub: any = (global as any).__E2E_STUB
    const stubUrl = stub ? stub.url : undefined
    await seedConfigFor(cwd, { SKIP_VERIFY: '1', AGENT: 'custom', LLM_PROVIDER: 'passthrough', stubUrl })
    const childEnv = { ...process.env, SKIP_VERIFY: '1' }
    await execa(
      'node',
      [cli, 'run', '--cwd', cwd, '--agent', 'custom', '--llm', 'passthrough', '--prompt', 'Spec implemented'],
      { env: childEnv }
    )
    const state = JSON.parse(readFileSync(path.join(cwd, '.agent', 'state.json'), 'utf8'))
    expect(state.status).toBeDefined()
    const prog = readFileSync(path.join(cwd, 'progress.json'), 'utf8')
    expect(prog).toMatch(/## Status[\s\S]*awaiting_review/)

    // verify run artifacts were recorded under .agent/runs/<runId>/
    const agentDir = path.join(cwd, '.agent')
    const runsDir = path.join(agentDir, 'runs')
    expect(existsSync(runsDir)).toBe(true)
    const runs = existsSync(runsDir) ? readdirSync(runsDir).filter((name) => statSync(path.join(runsDir, name)).isDirectory()) : []
    expect(runs.length).toBeGreaterThan(0)
    const latest = runs.sort().reverse()[0]
    const runJsonPath = path.join(runsDir, latest, 'run.json')
    expect(existsSync(runJsonPath)).toBe(true)
    const patchesPath = path.join(runsDir, latest, 'patches.diff')
    if (existsSync(patchesPath)) {
      expect(readFileSync(patchesPath, 'utf8').length).toBeGreaterThan(0)
    }
  })
})

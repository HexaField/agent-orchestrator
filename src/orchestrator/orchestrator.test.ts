import { describe, test, expect, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { runOrchestrator } from './orchestrator'

const RUN_ROOT = path.join(process.cwd(), '.agent', 'run')

async function cleanup() {
  try {
    await fs.rm(RUN_ROOT, { recursive: true, force: true })
  } catch {}
}

afterEach(async () => {
  await cleanup()
})

describe('Orchestrator', () => {
  test('runs with mocked adapters and writes artifacts', async () => {
    await cleanup()

    // mocked agent: startSession, run, stop
    const agent = {
      startSession: async () => 'sess-1',
      run: async (_session: any, input: any) => {
        return { text: 'agent-did: OK', meta: {} }
      },
      stop: async () => {},
    }

    // mocked llm: returns immediate 'yes' to end loop
    const llm = {
      call: async (_messages: any) => ({ text: 'Yes, complete' }),
    }

    const res = await runOrchestrator({ adapters: { agent, llm }, specPath: 'specs/orch.md', templateName: 'spec.md' })
    expect(res).toBeDefined()
    // verify run folder exists
    const stat = await fs.stat(res.runDir)
    expect(stat.isDirectory()).toBe(true)
    const compiled = await fs.readFile(path.join(res.runDir, 'compiled_prompt.md'), 'utf8')
    expect(compiled).toContain('specs/orch.md')
    const summary = JSON.parse(await fs.readFile(path.join(res.runDir, 'summary.json'), 'utf8'))
    expect(summary).toBeDefined()
  })
})

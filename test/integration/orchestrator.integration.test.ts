import { describe, test, expect, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { runOrchestrator } from '../../src/orchestrator/orchestrator'

const RUN_ROOT = path.join(process.cwd(), '.agent', 'run')

async function cleanup() {
  try {
    await fs.rm(RUN_ROOT, { recursive: true, force: true })
  } catch {}
}

afterEach(async () => {
  await cleanup()
})

describe('orchestrator integration', () => {
  test('end-to-end happy path with mocked adapters', async () => {
    await cleanup()

    // stateful LLM mock: first call -> 'No', second call -> 'Yes'
    let llmCalls = 0
    const llm = {
      call: async (_messages: any) => {
        llmCalls++
        if (llmCalls === 1) return { text: 'No, incomplete' }
        return { text: 'Yes, complete' }
      },
    }

    // simple agent mock that returns a diff on first run
    const agent = {
      startSession: async () => 'sess-int-1',
      run: async (_session: any, _input: any) => {
        return { text: 'Performed action', diff: '+++ file.txt', stdout: 'ok', stderr: '' }
      },
      stop: async () => {},
    }

    const res = await runOrchestrator({ adapters: { agent, llm }, specPath: 'specs/integration.md', templateName: 'spec.md' })

    // orchestrator artifacts
    const stat = await fs.stat(res.runDir)
    expect(stat.isDirectory()).toBe(true)
    const compiled = await fs.readFile(path.join(res.runDir, 'compiled_prompt.md'), 'utf8')
    expect(compiled).toContain('specs/integration.md')

    // progress.json should exist and contain a summary
    const progressRaw = await fs.readFile(path.join(res.runDir, 'progress.json'), 'utf8')
    const progress = JSON.parse(progressRaw)
    expect(progress).toBeDefined()
    expect(progress.runId).toBeDefined()

    // TaskLoop artifacts
    const artifactsPath = res.taskLoopRes.artifactsPath
    const provDir = path.join(artifactsPath, 'provenance')
    const provStat = await fs.stat(provDir)
    expect(provStat.isDirectory()).toBe(true)
    const provFiles = await fs.readdir(provDir)
    expect(provFiles.length).toBeGreaterThan(0)
  })
})

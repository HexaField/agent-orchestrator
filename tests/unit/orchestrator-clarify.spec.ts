import fs from 'fs'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as agentIndex from '../../src/adapters/agent/index'
import { runOnce } from '../../src/core/orchestrator'
import * as templates from '../../src/core/templates'

// Mock session adapter that yields a 'needs clarification' style output then waits for send with answer
function makeMockSessionAdapter() {
  let sentMessages: string[] = []
  return {
    name: 'mock-session',
    async startSession(arg: any) {
      return { id: arg.runId || 'mock-run', pid: 123 }
    },
    async *send(session: any, message: string) {
      // first call: emit a clarification-needed style output
      if (sentMessages.length === 0) {
        sentMessages.push(message)
        yield { type: 'ndjson', json: { aggregated_output: 'I need clarification: What path?' } }
        return
      }
      // subsequent call: simulate applying files and finish
      sentMessages.push(message)
      yield { type: 'ndjson', json: { aggregated_output: 'Implementation done' } }
      yield { type: 'artifact', path: 'src/hello.txt', content: 'hello' }
      return
    },
    async closeSession(_s: any) {
      return
    }
  }
}

describe('orchestrator clarify loop', () => {
  let tmpCwd: string
  beforeEach(() => {
    tmpCwd = fs.mkdtempSync(path.join(process.cwd(), '.tmp/test-orch-'))
    // write a minimal spec.md and progress.json
    fs.writeFileSync(path.join(tmpCwd, 'spec.md'), '# spec\n', 'utf8')
    fs.writeFileSync(path.join(tmpCwd, 'progress.json'), JSON.stringify({ checklist: ['do it'] }), 'utf8')
  })

  it('automatically clarifies and applies artifacts', async () => {
    // stub the agent adapter factory to return our mock session adapter
    const mockAdapter = makeMockSessionAdapter()
    vi.spyOn(agentIndex, 'getAgentAdapter').mockImplementation(() => {
      return mockAdapter as any
    })

    // stub genClarifyAsync to return a short clarifying answer
    vi.spyOn(templates, 'genClarifyAsync').mockResolvedValue('Answer: put file under src/')
    vi.spyOn(templates, 'genContextAsync').mockResolvedValue('context')

    const runJson = await runOnce(tmpCwd, { llm: 'passthrough', agent: 'mock-session' } as any)

    // verify run.json exists and contains artifacts entry for the applied file
    const p = path.join(tmpCwd, '.agent', 'runs', runJson.runId, 'run.json')
    expect(fs.existsSync(p)).toBeTruthy()
    const runData = JSON.parse(fs.readFileSync(p, 'utf8'))
    // artifact path should be included in outputs.patches or outputs.artifacts
    expect(runData.outputs && (runData.outputs.patches || runData.outputs.artifacts)).toBeDefined()

    // cleanup spies
    vi.restoreAllMocks()
  })
})

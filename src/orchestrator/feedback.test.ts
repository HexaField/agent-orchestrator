import { describe, test, expect } from 'vitest'
import analyzeIteration from './feedback'
import type { LLMAdapter } from '../adapters/llm/interface'

const makeStubLLM = (text: string): LLMAdapter => ({
  async call() {
    return { text }
  }
})

describe('feedback.analyzeIteration', () => {
  test('parses well-formed JSON from LLM', async () => {
    const payload = JSON.stringify({
      verdict: 'complete',
      confidence: 0.9,
      rationale: 'All good',
      issues: [],
      steering: []
    })

    const llm = makeStubLLM(payload)
    const res = await analyzeIteration({ llm, runId: 'r1', iteration: 1, task: 't', agentOutput: { text: 'ok' } })
    expect(res.verdict).toBe('complete')
    expect(res.confidence).toBe(0.9)
    expect(res.rationale).toBe('All good')
  })

  test('falls back when JSON is malformed', async () => {
    const llm = makeStubLLM('yes, this looks done')
    const res = await analyzeIteration({ llm, runId: 'r2', iteration: 2, task: 't', agentOutput: { text: 'ok' } })
    expect(res.verdict).toBe('complete')
    expect(res.confidence).toBeGreaterThan(0)
  })
})

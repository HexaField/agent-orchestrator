import { describe, expect, test } from 'vitest'
import type { LLMAdapter } from '../adapters/llm/interface'
import analyzeIteration from './feedback'

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
    expect(res.feedback.verdict).toBe('complete')
    expect(res.feedback.confidence).toBe(0.9)
    expect(res.feedback.rationale).toBe('All good')
  })

  test('falls back when JSON is malformed', async () => {
    const llm = makeStubLLM('yes, this looks done')
    const res = await analyzeIteration({ llm, runId: 'r2', iteration: 2, task: 't', agentOutput: { text: 'ok' } })
    expect(res.feedback.verdict).toBe('complete')
    expect(res.feedback.confidence).toBeGreaterThan(0)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { reviewCode, reviewCodeAsync } from '../../src/core/review'
import * as llmIndex from '../../src/adapters/llm/index'

describe('automated review heuristics', () => {
  it('auto-approves small docs-only diffs', () => {
    const diff = `diff --git a/README.md b/README.md\n+++ b/README.md\n-Old\n+New\n`
    const res = reviewCode(diff)
    expect(res.status).toBe('approved')
    expect(res.required).toBe(false)
  })

  it('requires review when tests are modified', () => {
    const diff = `diff --git a/tests/example.spec.ts b/tests/example.spec.ts\n+++ b/tests/example.spec.ts\n+it('x', ()=>{})\n`
    const res = reviewCode(diff)
    expect(res.required).toBe(true)
    expect(res.status).toBe('changes_requested')
  })

  it('requires review for very large diffs', () => {
    const lines = new Array(600).fill('+line').join('\n')
    const diff = `diff --git a/large.txt b/large.txt\n${lines}`
    const res = reviewCode(diff)
    expect(res.status).toBe('changes_requested')
  })

  it('falls back to heuristic when LLM review is enabled but passthrough returns inconclusive text', async () => {
    process.env.AO_USE_LLM_REVIEW = '1'
    // monkey patch getLLMAdapter to return a neutral LLM that does not echo the prompt
    vi.spyOn(llmIndex, 'getLLMAdapter').mockImplementation(() => ({
      name: 'neutral',
      async generate() {
        return { text: 'I could not determine a definitive label.' }
      }
    } as any))
    const diff = `diff --git a/README.md b/README.md\n+++ b/README.md\n-Old\n+New\n`
    const res = await reviewCodeAsync(diff)
    expect(res.status).toBe('approved')
    process.env.AO_USE_LLM_REVIEW = undefined
  })
})

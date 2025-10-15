import { describe, expect, it, vi } from 'vitest'
import * as llmIndex from '../../src/adapters/llm/index'
import { reviewCode, reviewCodeAsync } from '../../src/core/review'

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
    const fs = await import('fs-extra')
    const path = await import('path')
    const { seedConfigFor } = await import('../support/seedConfig')
    const tmp = path.join(__dirname, '.tmp-review-autoreview')
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
  await seedConfigFor(tmp, { USE_LLM_REVIEW: '1', LLM_PROVIDER: 'passthrough' })
    // monkey patch getLLMAdapter to return a neutral LLM that does not echo the prompt
    vi.spyOn(llmIndex, 'getLLMAdapter').mockImplementation(
      () =>
        ({
          name: 'neutral',
          async generate() {
            return { text: 'I could not determine a definitive label.' }
          }
        }) as any
    )
    const origCwd = process.cwd()
    try {
      process.chdir(tmp)
      const diff = `diff --git a/README.md b/README.md\n+++ b/README.md\n-Old\n+New\n`
      const res = await reviewCodeAsync(diff)
      expect(res.status).toBe('approved')
    } finally {
      process.chdir(origCwd)
      await fs.remove(tmp)
    }
  })
})

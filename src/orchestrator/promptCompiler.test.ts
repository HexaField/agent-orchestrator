import { describe, test, expect } from 'vitest'
import { compilePrompt } from './promptCompiler'

describe('PromptCompiler', () => {
  test('compiles spec.md with valid inputs', async () => {
    const inputs = { title: 'My Spec', specPath: 'specs/my-spec.md', checklist: ['one', 'two'] }
    const out = await compilePrompt('spec.md', inputs as any)
    expect(out).toBeDefined()
    expect(out.user).toContain('My Spec')
    expect(out.user).toContain('specs/my-spec.md')
  })

  test('throws for missing required input', async () => {
    const inputs = { title: 'Incomplete' }
    await expect(compilePrompt('spec.md', inputs as any)).rejects.toThrow(/validation failed|Missing template input/)
  })
})

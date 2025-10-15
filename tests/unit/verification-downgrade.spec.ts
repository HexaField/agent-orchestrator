import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seedConfigFor } from '../support/seedConfig'
// we'll import runOnce dynamically after stubbing runVerification

// We'll stub runVerification by setting SKIP_VERIFY=undefined and
// mocking the imported runVerification at runtime isn't trivial without changing code.
// Instead, we'll rely on the runOnce logic: when whatDone is 'spec_implemented' it
// checks verification object. To simulate a failing verification, we'll monkeypatch
// the validation module by writing a small shim file into node's require cache.

describe('orchestrator verification downgrade', () => {
  const tmp = path.join(__dirname, '.tmp-verify')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
    // write a dummy spec file so genChecklist gets something
    await fs.writeFile(path.join(tmp, 'spec.md'), '# Spec\n\nDo X', 'utf8')
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('downgrades spec_implemented to failed when verification shows test failures', async () => {
    // Create a faux agent adapter behavior: the custom adapter triggers spec_implemented
    // when prompt includes 'spec implemented' - easier approach: call runOnce with custom
    // agent that returns stdout indicating spec_implemented. The adapters in tests are
    // simple; here we rely on the 'custom' adapter implementation in repo to behave.
    await seedConfigFor(tmp, { SKIP_VERIFY: '' })
    // To simulate failing verification, write a stub validation/verify.ts that returns failing results.
    const verifyPath = path.join(__dirname, '..', '..', 'src', 'validation', 'verify.ts')
    await fs.ensureDir(path.dirname(verifyPath))
    await fs.writeFile(
      verifyPath,
      `export async function runVerification() { return { lint: 'fail', typecheck: 'pass', tests: { passed: 0, failed: 1 } } }\n`,
      'utf8'
    )

    // Now import orchestrator (after the stub is in place) so it pulls our stubbed verifier
    const orchestrator = await import('../../src/core/orchestrator')
    const res = await orchestrator.runOnce(tmp, {
      llm: 'passthrough',
      agent: 'custom',
      prompt: 'spec implemented',
      force: true
    })
    expect(res.whatDone).not.toBe('spec_implemented')
    expect(res.whatDone).toBe('failed')
  })
})

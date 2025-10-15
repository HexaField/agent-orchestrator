import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('runVerification', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns skipped when SKIP_VERIFY in project config (env override)', async () => {
    // Set env var so verify short-circuits regardless of module import order
    const prior = process.env.SKIP_VERIFY
    process.env.SKIP_VERIFY = '1'
    // import the module (may already be loaded) and call runVerification
    const mod = await import('../../src/validation/verify')
    const runVerification = mod.runVerification as any
    const res = await runVerification('/tmp')
    // restore env
    if (typeof prior === 'undefined') delete process.env.SKIP_VERIFY
    else process.env.SKIP_VERIFY = prior
    expect(res.skipped).toBeTruthy()
    expect(res.lint).toBe('pass')
    expect(res.typecheck).toBe('pass')
  })

  it('returns lint fail when npm lint fails and still attempts typecheck', async () => {
    vi.resetModules()
    // make sure SKIP_VERIFY is not set in env for this test
    if (typeof process.env.SKIP_VERIFY !== 'undefined') delete process.env.SKIP_VERIFY
    // mock execa before importing verify
    vi.mock('execa', () => ({ execa: vi.fn() }))
    const execaMod = await import('execa')
    ;(execaMod.execa as any).mockImplementationOnce(() => Promise.reject(new Error('lint error')))
    ;(execaMod.execa as any).mockImplementationOnce(() => Promise.resolve({ stdout: '' }))
    const os = await import('os')
    const path = await import('path')
    const { mkdtempSync } = await import('fs')
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ao-verify-'))
    const mod = await import(`../../src/validation/verify?cachebust=${Date.now()}`)
    const runVerification = mod.runVerification as any
    const res = await runVerification(tmp)
    expect(res.skipped).toBeFalsy()
    expect(res.lint).toBe('fail')
    expect(res.typecheck).toBe('pass')
  })
})

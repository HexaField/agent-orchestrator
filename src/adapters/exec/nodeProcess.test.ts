import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import nodeProcess from './nodeProcess'

describe('NodeProcess ExecAdapter', () => {
  it('runs a successful command and captures stdout', async () => {
    const res = await nodeProcess.run({ cmd: `echo hello` })
    expect(res.code).toBe(0)
    expect(res.stdout.trim()).toBe('hello')
    expect(typeof res.durationMs).toBe('number')
  })

  it('returns non-zero exit code for failing command', async () => {
    // use a shell builtin exit to ensure portability
    const res = await nodeProcess.run({ cmd: `sh -c "exit 2"` })
    expect(res.code).toBe(2)
  })

  it('enforces timeout and marks timedOut', async () => {
    const res = await nodeProcess.run({ cmd: `sleep 2`, timeoutMs: 100 })
    expect(res.timedOut).toBe(true)
  })

  it('propagates env variables to the child', async () => {
    const res = await nodeProcess.run({ cmd: `sh -c 'printf "%s" "$TEST_VAR"'`, env: { TEST_VAR: 'ok' } })
    expect(res.stdout).toBe('ok')
    expect(res.code).toBe(0)
  })

  it('respects cwd option', async () => {
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ao-'))
    const res = await nodeProcess.run({ cmd: 'pwd', cwd: tmp })
    const real = await fs.promises.realpath(tmp)
    expect(res.stdout.trim()).toBe(real)
  })
})

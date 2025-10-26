import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { runVerification } from './engine'

describe('VerificationEngine', () => {
  it('runs commands, marks pass/fail, and writes provenance', async () => {
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ao-verify-'))
    const prov = path.join(tmp, 'prov.log')

    const commands = [
      { name: 'echo', cmd: 'echo ok' },
      { name: 'fail', cmd: 'sh -c "exit 2"' },
      { name: 'timeout', cmd: 'sleep 2', timeoutMs: 50 }
    ]

    const res = await runVerification(commands as any, { provenancePath: prov })

    expect(res.checks.find((c) => c.name === 'echo')!.status).toBe('pass')
    expect(res.checks.find((c) => c.name === 'fail')!.status).toBe('fail')
    // timeout should be treated as a fail
    expect(res.checks.find((c) => c.name === 'timeout')!.status).toBe('fail')

    const lines = (await fs.promises.readFile(prov, { encoding: 'utf8' })).trim().split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(3)
    const parsed = lines.map((l) => JSON.parse(l))
    expect(parsed[0].type).toBe('verification.check')
    // failing checks include stderr/stdout in payload
    expect(parsed.find((p: any) => p.name === 'fail').payload.result.code).toBe(2)
  })
})

import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { runVerification } from '../../src/verification/engine'

describe('Integration: verification -> provenance', () => {
  it('runs a small verification plan and writes JSONL provenance with stdout/stderr', async () => {
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ao-int-'))
    const prov = path.join(tmp, 'prov.log')
    const repoDir = path.join(tmp, 'repo')
    await fs.promises.mkdir(repoDir, { recursive: true })
    await fs.promises.writeFile(path.join(repoDir, 'file.txt'), 'hello')

    const commands = [
      { name: 'list', cmd: 'ls -1', cwd: repoDir },
      // emit to stderr and exit non-zero so we can validate stderr is captured
      { name: 'fail', cmd: 'sh -c "echo failmsg 1>&2; exit 3"', cwd: repoDir },
      { name: 'cat', cmd: 'cat file.txt', cwd: repoDir }
    ]

    const res = await runVerification(commands as any, { provenancePath: prov })

    // result checks present
    expect(res.checks.length).toBe(3)
    const file = await fs.promises.readFile(prov, { encoding: 'utf8' })
    const lines = file.trim().split('\n')
    expect(lines.length).toBe(3)

    const parsed = lines.map((l) => JSON.parse(l))
    // second command should have exit code 3 and stderr containing 'failmsg'
    const failEvent = parsed.find((p: any) => p.name === 'fail')
    expect(failEvent).toBeTruthy()
    expect(failEvent.payload.result.code).toBe(3)
    expect(String(failEvent.payload.result.stderr)).toContain('failmsg')
  })
})

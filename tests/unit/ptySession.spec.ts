import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { createSessionSender, startPtySession } from '../../src/adapters/agent/ptySession'

function makeFakePty(seq: string[]) {
  let onData: (d: string) => void = () => {}
  return {
    write(s: string) {
      void s
      // when write is called, emit the seq as data events once
      setTimeout(() => {
        for (const e of seq) onData(e)
      }, 10)
    },
    on(ev: string, cb: (d: string) => void) {
      if (ev === 'data') onData = cb
    },
    kill() {},
    pid: 11111
  }
}

describe('ptySession helper', () => {
  it('startPtySession persists .session-start.log and createSessionSender yields artifacts', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-pty-'))
    const fakeFactory = () => makeFakePty([JSON.stringify({ response: 'hi' }) + '\n', 'diff --git a/x b/x\n+hello\n'])
    const res = await startPtySession({ cmd: 'fake', cwd: tmp, ptyFactory: fakeFactory })
    expect(res).toBeDefined()
    const runsDir = path.join(tmp, '.agent', 'runs')
    // small delay to allow start hook to write
    await new Promise((r) => setTimeout(r, 50))
    const files = fs.readdirSync(runsDir)
    expect(files.some((f) => f.endsWith('.session-start.log'))).toBeTruthy()

    // consume created session sender by writing into pty
    const iter = createSessionSender({ pty: res.pty as any, sessionId: res.id, cwd: tmp })
    for await (const ev of iter) {
      void ev
    }

    // allow extractor to flush
    await new Promise((r) => setTimeout(r, 200))
    const patchesPath = path.join(runsDir, `${res.id}.patches.diff`)
    expect(fs.existsSync(patchesPath)).toBeTruthy()

    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {}
  })
})

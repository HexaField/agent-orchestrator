import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { createCodexPtyAdapter } from '../../src/adapters/agent/codexPty'

function makeFakePtyWithPatch(patches: string) {
  let onData: (d: string) => void = () => {}
  return {
    write(_s: string) {
      void _s
      setTimeout(() => {
        // emit a couple of NDJSON events and then a patch
        onData(JSON.stringify({ item: { type: 'agent_message', text: 'hello' } }) + '\n')
        onData(JSON.stringify({ item: { type: 'agent_message', text: 'done' } }) + '\n')
        // emit a unified patch as plain text; extractor should collect this
        onData(patches + '\n')
      }, 10)
    },
    on(ev: string, cb: (d: string) => void) {
      if (ev === 'data') onData = cb
    },
    kill() {},
    pid: 99999
  }
}

describe('pty + artifact extractor integration', () => {
  it('writes patches.diff and session log for a run', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-unit-'))
    const patches = `diff --git a/hello.txt b/hello.txt\nnew file mode 100644\nindex 0000000..e69de29\n+++ b/hello.txt\n@@ -0,0 +1 @@\n+Hello\n`

    const fakeFactory = (_cmd: string, _args: string[], _opts: any) => {
      void _cmd
      void _args
      void _opts
      return makeFakePtyWithPatch(patches)
    }
    const a = createCodexPtyAdapter({ ptyFactory: fakeFactory })
    const oldCwd = process.cwd()
    let sessionId: string | undefined
    try {
      process.chdir(tmp)
      const session = await a.startSession!({ cwd: tmp })
      sessionId = session.id

      // debug: list tmp dir contents to see where artifactExtractor writes
      try {
        const ls = fs.readdirSync(tmp)
        console.log('TMP DIR LISTING AFTER startSession:', ls)
        console.log('.agent exists?', fs.existsSync(path.join(tmp, '.agent')))
      } catch (err) {
        console.log('debug read tmp failed', String(err))
      }

      // consume the async iterable to allow extractor to finalize
      const iter = a.send!(session, 'generate patch')
      for await (const ev of iter) {
        void ev
      }

      await a.closeSession!(session)
    } finally {
      process.chdir(oldCwd)
    }

    // small delay to allow finalize to flush files
    await new Promise((r) => setTimeout(r, 500))

    // check runs dir for artifacts
    const runsDir = path.join(tmp, '.agent', 'runs')
    expect(fs.existsSync(runsDir)).toBe(true)

    // artifactExtractor writes files named by sessionId into .agent/runs
    expect(sessionId).toBeDefined()
    const sid = sessionId || ''
    const patchesPath = path.join(runsDir, `${sid}.patches.diff`)
    const sessionLog = path.join(runsDir, `${sid}.session.log`)
    expect(fs.existsSync(patchesPath)).toBe(true)
    expect(fs.readFileSync(patchesPath, 'utf8')).toContain('diff --git')
    // session log should exist and contain some NDJSON lines
    expect(fs.existsSync(sessionLog)).toBe(true)
    const log = fs.readFileSync(sessionLog, 'utf8')
    expect(log).toContain('agent_message')

    // cleanup
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {}
  })
})

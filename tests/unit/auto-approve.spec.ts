import { describe, expect, it } from 'vitest'
import { createCodexPtyAdapter } from '../../src/adapters/agent/codexPty'

// Fake PTY that emits a sandbox prompt and then emits a patch after write
function makeFakePtySandbox() {
  let onData: (d: string) => void = () => {}
  let emitted = false
  return {
    write(_s: string) {
      void _s
      // only emit once (first write) to avoid loops when adapter auto-responds
      if (emitted) return
      emitted = true
      // simulate immediate sandbox prompt emission when session started
      setTimeout(() => {
        onData('You are running codex in /tmp/foo. Allow codex to work?\n1. Yes  2. No\nPress Enter to continue\n')
        // after a short delay, emit a patch as plain text
        setTimeout(() => {
          onData(
            'diff --git a/hello.txt b/hello.txt\nnew file mode 100644\nindex 0000000..e69de29\n+++ b/hello.txt\n@@ -0,0 +1 @@\n+Hello\n'
          )
        }, 30)
      }, 5)
    },
    on(ev: string, cb: (d: string) => void) {
      if (ev === 'data') onData = cb
    },
    kill() {},
    pid: 12345
  }
}

describe('adapter auto-approve', () => {
  it('auto-responds to sandbox prompt and produces artifact', async () => {
    const a = createCodexPtyAdapter({ ptyFactory: () => makeFakePtySandbox(), autoApprove: true })
    if (!a.startSession || !a.send) throw new Error('adapter missing session APIs')
    const session = await a.startSession({ cwd: process.cwd(), env: {}, runId: 'test-auto-approve' })
    const out: any[] = []
    for await (const ev of a.send(session, 'generate patch')) {
      out.push(ev)
    }
    // allow extractor to flush files
    await new Promise((r) => setTimeout(r, 200))
    // artifactExtractor writes a .patches.diff file in .agent/runs named by session id
    const path = require('path')
    const fs = require('fs')
    const runsDir = path.join(process.cwd(), '.agent', 'runs')
    const patchesPath = path.join(runsDir, `${session.id}.patches.diff`)
    expect(fs.existsSync(patchesPath)).toBeTruthy()
    expect(fs.readFileSync(patchesPath, 'utf8')).toContain('diff --git')
    await a.closeSession!(session)
  })
})

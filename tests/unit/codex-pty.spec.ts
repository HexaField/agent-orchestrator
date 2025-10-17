import { describe, expect, it } from 'vitest'
import { createCodexPtyAdapter } from '../../src/adapters/agent/codexPty'

function makeFakePty() {
  let onData: (d: string) => void = () => {}
  return {
    write(_s: string) {
      // simulate NDJSON response lines after a small delay
      setTimeout(() => {
        onData('{"thinking":"ok"}\n')
        onData('{"response":"done"}\n')
      }, 10)
    },
    on(ev: string, cb: (d: string) => void) {
      if (ev === 'data') onData = cb
    },
    kill() {},
    pid: 12345
  }
}

describe('codex PTY adapter', () => {
  it('starts a session, sends a message, and parses NDJSON lines', async () => {
    const fakeFactory = () => makeFakePty()
    const a = createCodexPtyAdapter({ ptyFactory: fakeFactory })
    const session = await a.startSession!({ cwd: process.cwd() })
    const iter = a.send!(session, 'implement this')
    const results: any[] = []
    for await (const ev of iter) {
      results.push(ev)
    }
    // Expect at least the two JSON objects we emitted
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0]).toHaveProperty('thinking', 'ok')
    expect(results[1]).toHaveProperty('response', 'done')
    await a.closeSession!(session)
  })
})

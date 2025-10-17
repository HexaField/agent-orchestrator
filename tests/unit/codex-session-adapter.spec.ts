import { describe, expect, it } from 'vitest'
import { createCodexPtyAdapter } from '../../src/adapters/agent/codexPty'

// This unit test uses the adapter's ptyFactory option to inject a fake PTY
// that emits controlled output. It verifies that send() yields ndjson,
// clarify, and artifact events. This is a focused unit test (stubbed PTY),
// not an integration test with the real codex binary.

describe('codex PTY adapter (unit)', () => {
  it('emits ndjson, clarify and artifact events from a mocked PTY', async () => {
    const eventsToEmit = [
      JSON.stringify({ thinking: 'Analyzing...' }) + '\n',
      JSON.stringify({ response: 'What file should I write?' }) + '\n',
      '=== src/hello.txt ===\nHello world\n',
      '```\n// File: src/cli/sum-lines.ts\nexport const sum = (a,b)=>a+b\n```\n'
    ]

    // Fake PTY implementation
    function makeFakePty(seq: string[]) {
      let onDataCb: (d: string) => void = () => {}
      return {
        write: () => {
          // when write is called, simulate the PTY emitting events
          setTimeout(() => {
            for (const e of seq) onDataCb(e)
            // end with no further data
          }, 10)
        },
        on: (ev: string, cb: (d: string) => void) => {
          if (ev === 'data') onDataCb = cb
        },
        kill: () => {}
      }
    }

    const adapter = createCodexPtyAdapter({ ptyFactory: () => makeFakePty(eventsToEmit) })
    if (!adapter.startSession || !adapter.send) throw new Error('adapter missing session APIs')
    const session = await adapter.startSession({ cwd: process.cwd(), env: {}, runId: 'test-run' })
    const out: any[] = []
    for await (const ev of adapter.send(session, 'implement the spec')) {
      out.push(ev)
    }
    expect(out.some((x) => x.type === 'ndjson')).toBeTruthy()
    expect(out.some((x) => x.type === 'clarify')).toBeTruthy()
    expect(out.some((x) => x.type === 'artifact')).toBeTruthy()
  })
})

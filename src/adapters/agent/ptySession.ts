import fs from 'fs'
import path from 'path'
import type { SessionEvent } from '../../types/adapters'
import { createArtifactExtractor } from './artifactExtractor'
import { createPtyParser } from './ptyParser'
import { matchSandboxPrompt, respondAutoApprove } from './sessionEvents'
import { sharedSessionManager } from './sessionManager'
import { normalizeSessionEvent } from './sessionNormalizer'

export type Pty = {
  write: (s: string) => void
  on: (ev: string, cb: (d: string) => void) => void
  kill: () => void
  pid?: number
}

export type PtyFactory = (cmd: string, args: string[], opts: any) => Pty

export function defaultPtyFactory(): PtyFactory {
  return (cmd: string, args: string[], opts: any) => {
    const nodePty = require('node-pty')
    return nodePty.spawn(cmd, args, opts) as unknown as Pty
  }
}

export async function startPtySession(opts: {
  cmd: string
  args?: string[]
  cwd: string
  env?: Record<string, string>
  runId?: string
  ptyFactory?: PtyFactory
  onSessionStart?: (id: string, baseDir: string, pty: Pty) => Promise<void> | void
}) {
  const { cmd, args = [], cwd, env, runId, onSessionStart } = opts
  const ptyFactory = opts.ptyFactory || defaultPtyFactory()
  const pty = ptyFactory(cmd, args, { cwd, env, cols: 120, rows: 40 })
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const reconnect = async () => {
    try {
      const newPty = ptyFactory(cmd, args, { cwd, env, cols: 120, rows: 40 })
      return { success: true, pty: newPty }
    } catch {
      return { success: false }
    }
  }

  sharedSessionManager.create(id, async () => {
    const r = await reconnect()
    if (r.success && r.pty) {
      return true
    }
    return false
  })

  // persist session-start and call optional session-start hook
  try {
    const base = runId ? path.join(cwd || '.', '.agent', 'runs', runId) : path.join(cwd || '.', '.agent', 'runs')
    fs.mkdirSync(base, { recursive: true })
    fs.writeFileSync(path.join(base, `${id}.session-start.log`), `spawned session ${id}\n`, 'utf8')
    if (onSessionStart) {
      try {
        await Promise.resolve(onSessionStart(id, base, pty))
      } catch {}
    }
  } catch {}

  return { id, pty, pid: pty.pid, reconnect }
}

export function createSessionSender(params: {
  pty: Pty
  sessionId: string
  cwd: string
  options?: { autoApprove?: boolean }
}): AsyncIterable<SessionEvent> {
  const { pty, sessionId, cwd, options } = params

  async function* gen(): AsyncGenerator<SessionEvent, void, unknown> {
    const parser = createPtyParser(sessionId, cwd)
    const extractor = createArtifactExtractor(sessionId, cwd)
    let resolver: (() => void) | null = null
    let finished = false

    const onData = (d: string) => {
      sharedSessionManager.touch(sessionId)
      parser.push(d)
      if (resolver) {
        resolver()
        resolver = null
      }
      // optional auto-approve
      try {
        if (options && options.autoApprove) {
          for (const line of String(d).split(/\r?\n/)) {
            if (!line) continue
            if (matchSandboxPrompt(line)) {
              void respondAutoApprove(async (s: string) => {
                try {
                  pty.write(String(s))
                } catch {}
              })
            }
          }
        }
      } catch {}
    }

    pty.on('data', onData)

    try {
      // wait until idle (external caller must write to pty to trigger output)
      while (!finished) {
        const events = parser.drain()
        for (const ev of events) {
          const raw = (ev as any).value
          try {
            const norm = normalizeSessionEvent(raw)
            if (norm) {
              if (norm.type === 'ndjson') {
                yield norm as SessionEvent
                try {
                  const text = (raw.aggregated_output || raw.response || raw.thinking || '') as string
                  if (typeof text === 'string' && /\?\s*$/.test(text.trim())) {
                    yield { type: 'clarify', question: text.trim() } as SessionEvent
                  }
                } catch {}
                try {
                  extractor.process(raw)
                } catch {}
                continue
              }
              yield norm as SessionEvent
              try {
                extractor.process(raw)
              } catch {}
              continue
            }
          } catch {}
        }

        await new Promise<void>((resolve) => {
          resolver = resolve
          const t = setTimeout(() => {
            resolver = null
            finished = true
            parser.flush()
            try {
              extractor.finalize()
            } catch {}
            resolve()
          }, 300)
          resolver = () => {
            clearTimeout(t)
            resolve()
          }
        })
      }

      // finalize artifacts
      try {
        const res = await extractor.finalize()
        if (res && res.markers) {
          for (const m of res.markers) yield { type: 'artifact', path: m.path, content: m.content } as SessionEvent
        }
        if (res && res.fences) {
          for (const f of res.fences) yield { type: 'artifact', content: f } as SessionEvent
        }
      } catch {}
    } finally {
      try {
        // remove listener if possible - node-pty uses .off or .removeListener depending on runtime
        if (typeof (pty as any).off === 'function') (pty as any).off('data', onData)
        else if (typeof (pty as any).removeListener === 'function') (pty as any).removeListener('data', onData)
      } catch {}
    }
  }

  return gen()
}

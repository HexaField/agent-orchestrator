import fs from 'fs'
import path from 'path'
import type { SessionAgentAdapter } from '../../types/adapters'
import { createArtifactExtractor } from './artifactExtractor'
import { createPtyParser } from './ptyParser'
import { sharedSessionManager } from './sessionManager'

/**
 * Create a PTY-backed Copilot adapter that maintains interactive sessions.
 *
 * - Always uses `node-pty` (no fallback).
 * - Pre-provisions auth by passing through GH/Copilot token env vars when present.
 * - Persists session transcripts to `.agent/runs/<sessionId>.session.log`.
 *
 * @param options Optional ptyFactory for tests
 */

type Pty = {
  write: (s: string) => void
  on: (ev: string, cb: (d: string) => void) => void
  kill: () => void
  pid?: number
}

export function createCopilotPtyAdapter(options?: {
  ptyFactory?: (cmd: string, args: string[], opts: any) => Pty
}): SessionAgentAdapter {
  const ptyFactory =
    options?.ptyFactory ||
    ((cmd: string, args: string[], opts: any) => {
      // Assume node-pty is always available in runtime environments.
      const nodePty = require('node-pty')
      return nodePty.spawn(cmd, args, opts) as unknown as Pty
    })

  const sessions = new Map<string, Pty>()

  return {
    name: 'copilot-pty',
    async run() {
      // fallback: non-interactive run is not supported for Copilot here; throw to enforce PTY-only behavior for MVP
      throw new Error('Copilot adapter run() non-PTY path not supported in PTY-only MVP')
    },
    async startSession({ cwd, env }) {
      const args: string[] = []
      // Pre-provision authentication tokens into the child env if provided
      const childEnv = Object.assign({}, env || {})
      // prefer explicit COPILOT_TOKEN, then GH_TOKEN
      if (!childEnv.COPILOT_TOKEN && childEnv.GH_TOKEN) childEnv.COPILOT_TOKEN = childEnv.GH_TOKEN

      const pty = ptyFactory('copilot', args, { cwd, env: childEnv, cols: 80, rows: 24 })
      const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      sessions.set(id, pty)
      const reconnectFn = async () => {
        try {
          const newPty = ptyFactory('copilot', args, { cwd, env: childEnv, cols: 80, rows: 24 })
          sessions.set(id, newPty)
          return true
        } catch {
          return false
        }
      }
      sharedSessionManager.create(id, reconnectFn)
      try {
        const outDir = path.join(cwd || '.', '.agent', 'runs')
        fs.mkdirSync(outDir, { recursive: true })
        fs.writeFileSync(path.join(outDir, `${id}.session-start.log`), `spawned session ${id}\n`, 'utf8')
        // create a session transcript file that will be appended to on each send
        fs.writeFileSync(path.join(outDir, `${id}.session.log`), `session ${id} started\n`, 'utf8')
        // write an auth hint file if no token was provided to help debugging
        if (!childEnv.COPILOT_TOKEN) {
          try {
            fs.writeFileSync(
              path.join(outDir, `${id}.auth-hint.txt`),
              'No COPILOT_TOKEN provided; interactive Copilot may prompt for auth.\n',
              'utf8'
            )
          } catch {}
        }
      } catch {}
      return { id, pid: pty.pid }
    },
    async *send(session, message) {
      const pty = sessions.get(session.id)
      if (!pty) throw new Error('session not found')
      const parser = createPtyParser(session.id, process.cwd())
      const extractor = createArtifactExtractor(session.id, process.cwd())
      let resolver: (() => void) | null = null
      let finished = false

      const onData = (d: string) => {
        sharedSessionManager.touch(session.id)
        parser.push(d)
        if (resolver) {
          resolver()
          resolver = null
        }
      }

      pty.on('data', onData)
      pty.write(message + '\n')

      while (!finished) {
        const events = parser.drain()
        for (const ev of events) {
          const val = (ev as any).value
          try {
            extractor.process(val)
          } catch {}
          yield val
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
    },
    async closeSession(session) {
      const pty = sessions.get(session.id)
      if (!pty) return
      try {
        pty.kill()
      } catch {}
      try {
        const outDir = path.join(process.cwd(), '.agent', 'runs')
        fs.appendFileSync(path.join(outDir, `${session.id}.session.log`), `session ${session.id} closed\n`, 'utf8')
      } catch {}
      sharedSessionManager.close(session.id)
      sessions.delete(session.id)
    }
  }
}

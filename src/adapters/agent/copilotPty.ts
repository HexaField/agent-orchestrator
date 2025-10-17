import fs from 'fs'
import path from 'path'
import type { SessionAgentAdapter } from '../../types/adapters'
import { createSessionSender, PtyFactory, startPtySession } from './ptySession'

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
  autoApprove?: boolean
}): SessionAgentAdapter {
  // ptyFactory is provided to startPtySession via options when needed

  return {
    name: 'copilot-pty',
    async run() {
      // fallback: non-interactive run is not supported for Copilot here; throw to enforce PTY-only behavior for MVP
      throw new Error('Copilot adapter run() non-PTY path not supported in PTY-only MVP')
    },
    async startSession({ cwd, env, runId }) {
      const childEnv = Object.assign({}, env || {})
      if (!childEnv.COPILOT_TOKEN && childEnv.GH_TOKEN) childEnv.COPILOT_TOKEN = childEnv.GH_TOKEN
      const res = await startPtySession({
        cmd: 'copilot',
        cwd,
        env: childEnv,
        runId,
        ptyFactory: options?.ptyFactory as PtyFactory,
        onSessionStart: (id: string, base: string) => {
          try {
            fs.writeFileSync(path.join(base, `${id}.session.log`), `session ${id} started\n`, 'utf8')
            if (!childEnv.COPILOT_TOKEN) {
              try {
                fs.writeFileSync(
                  path.join(base, `${id}.auth-hint.txt`),
                  'No COPILOT_TOKEN provided; interactive Copilot may prompt for auth.\n',
                  'utf8'
                )
              } catch {}
            }
          } catch {}
        }
      })
      ;(this as any)._sessions = (this as any)._sessions || new Map()
      ;(this as any)._sessions.set(res.id, res.pty)
      return { id: res.id, pid: res.pid }
    },
    async *send(session, message) {
      ;(this as any)._sessions = (this as any)._sessions || new Map()
      const pty = (this as any)._sessions.get(session.id)
      if (!pty) throw new Error('session not found')
      pty.write(message + '\n')
      for await (const ev of createSessionSender({
        pty,
        sessionId: session.id,
        cwd: process.cwd(),
        options: { autoApprove: !!options?.autoApprove }
      })) {
        yield ev
      }
    },
    async closeSession(session) {
      ;(this as any)._sessions = (this as any)._sessions || new Map()
      const pty = (this as any)._sessions.get(session.id)
      if (!pty) return
      try {
        pty.kill()
      } catch {}
      try {
        const outDir = path.join(process.cwd(), '.agent', 'runs')
        fs.appendFileSync(path.join(outDir, `${session.id}.session.log`), `session ${session.id} closed\n`, 'utf8')
      } catch {}
      ;(this as any)._sessions.delete(session.id)
    }
  }
}

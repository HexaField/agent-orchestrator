import { execFileSync } from 'child_process'
import type { SessionAgentAdapter } from '../../types/adapters'
import { createSessionSender, PtyFactory, startPtySession } from './ptySession'

type Pty = {
  write: (s: string) => void
  on: (ev: string, cb: (data: string) => void) => void
  kill: () => void
  pid?: number
}

export function createCodexPtyAdapter(options?: {
  ptyFactory?: (cmd: string, args: string[], opts: any) => Pty
  autoApprove?: boolean
}): SessionAgentAdapter {
  return {
    name: 'codex-pty',
    async run(input) {
      // fallback run: spawn exec --json once and collect output (keeps parity with old adapter)
      const args = ['exec', '--json', input.prompt || '']
      try {
        const out = execFileSync('codex', args, {
          cwd: input.cwd,
          env: input.env,
          encoding: 'utf8',
          timeout: input.timeoutMs ?? 60000
        })
        return { stdout: String(out || ''), stderr: '', exitCode: 0 }
      } catch (e: any) {
        return { stdout: String(e.stdout || ''), stderr: String(e.stderr || ''), exitCode: e.status || 1 }
      }
    },
    async startSession({ cwd, env, runId }) {
      const res = await startPtySession({
        cmd: 'codex',
        cwd,
        env,
        runId,
        ptyFactory: options?.ptyFactory as PtyFactory
      })
      // store the pty on the adapter instance for send/close to use
      ;(this as any)._sessions = (this as any)._sessions || new Map()
      ;(this as any)._sessions.set(res.id, res.pty)
      return { id: res.id, pid: res.pid }
    },
    async *send(session, message) {
      ;(this as any)._sessions = (this as any)._sessions || new Map()
      const pty = (this as any)._sessions.get(session.id)
      if (!pty) throw new Error('session not found')
      // write message into pty and yield events from the shared session sender
      pty.write(message + '\n')
      for await (const ev of createSessionSender({
        pty,
        sessionId: session.id,
        cwd: process.cwd(),
        options: { autoApprove: !!options?.autoApprove }
      })) {
        // Emit normalized SessionEvent objects produced by createSessionSender
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
      ;(this as any)._sessions.delete(session.id)
    }
  }
}

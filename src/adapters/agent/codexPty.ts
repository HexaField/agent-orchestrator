import fs from 'fs'
import path from 'path'
import type { SessionAgentAdapter } from '../../types/adapters'
import { createArtifactExtractor } from './artifactExtractor'
import { createPtyParser } from './ptyParser'
import { sharedSessionManager } from './sessionManager'

type Pty = {
  write: (s: string) => void
  on: (ev: string, cb: (data: string) => void) => void
  kill: () => void
  pid?: number
}

export function createCodexPtyAdapter(options?: {
  ptyFactory?: (cmd: string, args: string[], opts: any) => Pty
}): SessionAgentAdapter {
  const ptyFactory =
    options?.ptyFactory ||
    ((cmd: string, args: string[], opts: any) => {
      // Assume `node-pty` is always installed in the runtime environment and
      // use it directly. Do not attempt any fallback; if `node-pty` is missing
      // the process will throw at require time which surfaces the missing
      // dependency immediately.
      const nodePty = require('node-pty')
      return nodePty.spawn(cmd, args, opts) as unknown as Pty
    })

  const sessions = new Map<string, Pty>()

  return {
    name: 'codex-pty',
    async run(input) {
      // fallback run: spawn exec --json once and collect output (keeps parity with old adapter)
      const args = ['exec', '--json', input.prompt || '']
      // Use child_process for the non-PTY run to keep it simple here
      const { execFileSync } = await import('child_process')
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
    async startSession({ cwd, env }) {
      // build args to enable NDJSON streaming where appropriate
      // start interactive codex (no --json flag in PTY mode)
      const args: string[] = []
      const pty = ptyFactory('codex', args, { cwd, env, cols: 120, rows: 40 })
      const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      sessions.set(id, pty)
      // register with session manager and provide a reconnect function
      const reconnectFn = async () => {
        try {
          const newPty = ptyFactory('codex', args, { cwd, env, cols: 120, rows: 40 })
          sessions.set(id, newPty)
          return true
        } catch {
          return false
        }
      }
      sharedSessionManager.create(id, reconnectFn)
      // persist early session log file
      try {
        const outDir = path.join(cwd || '.', '.agent', 'runs')
        fs.mkdirSync(outDir, { recursive: true })
        fs.writeFileSync(path.join(outDir, `${id}.session-start.log`), `spawned session ${id}\n`, 'utf8')
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

      // idle-based end: wait for 300ms of no new data
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
            // flush any buffered partial line
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
      sessions.delete(session.id)
    }
  }
}

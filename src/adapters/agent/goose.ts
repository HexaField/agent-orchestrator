import { spawn } from 'child_process'
import * as fs from 'fs/promises'
import { AgentAdapter, AgentRunResult, AgentStartOptions } from './interface'

/**
 * Goose adapter (compatible with Goose CLI 1.12.x as per `goose --help`)
 *
 * Strategy:
 * 1) Try **named-session** flow using only commands that exist in your CLI:
 *      - Start/append:   `goose run --name <id> --resume --text "<msg>"`
 *      - Export:         `goose session export --name <id> --format json`
 *    NOTE: Some builds require the session to already exist. If the first `run`
 *    complains "No session found", we fall back to stateless mode.
 *
 * 2) Fallback **stateless** flow (no sessions):
 *      - Turn execution: `goose run --text "<msg>"`
 *    We keep our own minimal transcript (in-memory) and only return stdout.
 *
 * This avoids subcommands your binary doesn’t have (`chat`, `session create`),
 * and it avoids `--path` which expects a pre-existing run-session file.
 */
export async function createGooseAgentAdapter(projectPath: string): Promise<AgentAdapter> {
  type HistoryMsg = { role: 'user' | 'assistant' | 'system'; content: string }

  const runCmd = (
    cmd: string,
    args: string[] = [],
    { cwd = projectPath, env }: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
  ): Promise<{ code: number | null; stdout: string; stderr: string }> => {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd,
        env: { ...process.env, ...env },
        shell: process.platform === 'win32'
      })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (d) => (stdout += d))
      child.stderr.on('data', (d) => (stderr += d))
      child.on('error', (err) => reject(err))
      child.on('close', (code) => resolve({ code, stdout, stderr }))
    })
  }

  const makeSessionName = (title?: string) => {
    if (title?.trim()) return title.trim().replace(/\s+/g, '-')
    const ts = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14)
    return `orchestrator-${ts}`
  }

  const extractLastAssistantText = (jsonText: string): string | undefined => {
    try {
      const data = JSON.parse(jsonText)
      const messages: any[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any).messages)
          ? (data as any).messages
          : []
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        const role = m.role || m.author || m.sender || ''
        if (String(role).toLowerCase().includes('assistant')) {
          if (typeof m.content === 'string') return m.content
          if (Array.isArray(m.parts)) {
            const textPart = m.parts.find((p: any) => p?.type === 'text' && typeof p.text === 'string')
            if (textPart) return textPart.text
          }
          if (typeof m.text === 'string') return m.text
        }
      }
    } catch {
      // ignore parse errors
    }
    return undefined
  }

  // In-memory transcript for stateless fallback
  const transcripts = new Map<string, HistoryMsg[]>()
  let isStopped = false

  const ensureWorkspace = async () => {
    try {
      await fs.mkdir(`${projectPath}/.goose`, { recursive: true })
    } catch {
      /* best effort */
    }
  }

  return {
    async startSession(options: AgentStartOptions): Promise<string> {
      if (isStopped) throw new Error('Adapter has been stopped')
      await ensureWorkspace()
      const name = makeSessionName(options.title)

      // Try to “touch” the named session by doing a no-op run.
      // Some Goose builds will succeed (creating/resuming), others will return “No session found”.
      const seed = await runCmd('goose', [
        'run',
        '--name',
        name,
        '--resume',
        '--text',
        'initialize session',
        '--max-turns',
        String(options.limits?.maxIterations ?? 1)
      ])

      if (seed.code !== 0 && /no session found/i.test(seed.stderr)) {
        // Fall back to stateless mode for this session id
        transcripts.set(name, [])
      } else if (seed.code !== 0) {
        throw new Error(`Failed to start Goose session '${name}': ${seed.stderr || 'unknown error'}`)
      }

      return name
    },

    async run(sessionId: string, input: string): Promise<AgentRunResult> {
      if (isStopped) throw new Error('Adapter has been stopped')

      // If we previously fell back to stateless for this session, or if a named run fails,
      // we’ll use stateless execution.
      const runNamed = async () => {
        const res = await runCmd('goose', ['run', '--name', sessionId, '--resume', '--text', input])
        if (res.code !== 0) return res
        // Try to export the assistant’s latest reply
        const exp = await runCmd('goose', ['session', 'export', '--name', sessionId, '--format', 'json'])
        if (exp.code !== 0) {
          // If export fails (e.g., session not actually present), return the run’s stdout as best-effort text
          return { code: 0, stdout: res.stdout, stderr: '' }
        }
        const text = extractLastAssistantText(exp.stdout) ?? res.stdout
        return { code: 0, stdout: text, stderr: '' }
      }

      const runStateless = async () => {
        const history = transcripts.get(sessionId) ?? []
        // You can choose to include history here if Goose benefits from it.
        // For safety, we only send the current turn (Goose will rely on its tools/context).
        const exec = await runCmd('goose', ['run', '--text', input])
        if (exec.code !== 0) {
          throw new Error(`Goose run failed: ${exec.stderr || 'unknown error'}`)
        }
        // Save a minimal transcript locally (not used by Goose, only for our adapter)
        history.push({ role: 'user', content: input })
        history.push({ role: 'assistant', content: exec.stdout })
        transcripts.set(sessionId, history)
        return { code: 0, stdout: exec.stdout, stderr: '' }
      }

      const alreadyStateless = transcripts.has(sessionId)
      let out: { code: number | null; stdout: string; stderr: string }

      if (alreadyStateless) {
        out = await runStateless()
      } else {
        const named = await runNamed()
        if (named.code !== 0 || /no session found/i.test(named.stderr)) {
          // Switch this session to stateless fallback
          out = await runStateless()
        } else {
          out = named
        }
      }

      return { text: out.stdout.trim() }
    },

    async stop(): Promise<void> {
      isStopped = true
    }
  }
}

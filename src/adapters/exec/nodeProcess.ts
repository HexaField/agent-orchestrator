import { spawn } from 'child_process'
import { ExecAdapter, ExecOptions, ExecResult } from './interface'

/**
 * NodeProcess exec adapter
 * Runs a shell command and returns structured output including duration and exit metadata.
 */
const nodeExec: ExecAdapter = {
  async run(opts: ExecOptions): Promise<ExecResult> {
    const { cmd, cwd, env, timeoutMs } = opts

    const start = Date.now()

    return new Promise<ExecResult>((resolve) => {
      const child = spawn(cmd, {
        shell: true,
        cwd,
        env: { ...process.env, ...(env || {}) },
        detached: true
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false
      let timeoutTimer: NodeJS.Timeout | undefined

      if (child.stdout) child.stdout.on('data', (d) => (stdout += d.toString()))
      if (child.stderr) child.stderr.on('data', (d) => (stderr += d.toString()))

      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer)
      }

      if (typeof timeoutMs === 'number' && timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          timedOut = true
          try {
            // try to kill the whole process group
            if (child.pid) process.kill(-child.pid, 'SIGTERM')
          } catch (e) {
            try {
              child.kill('SIGTERM')
            } catch (_e) {
              // ignore
            }
          }
        }, timeoutMs)
      }

      child.on('error', (err) => {
        cleanup()
        const durationMs = Date.now() - start
        resolve({ code: null, stdout, stderr, durationMs, signal: null, timedOut, error: String(err) })
      })

      child.on('close', (code, signal) => {
        cleanup()
        const durationMs = Date.now() - start
        resolve({ code, stdout, stderr, durationMs, signal, timedOut })
      })
    })
  }
}

export default nodeExec

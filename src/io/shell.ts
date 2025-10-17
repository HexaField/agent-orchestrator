import { execa } from 'execa'
// config helpers imported dynamically where needed

const REDACT_KEYS = ['TOKEN', 'KEY', 'SECRET', 'PASSWORD']

export function redactEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) {
    if (v == null) continue
    const upper = k.toUpperCase()
    if (REDACT_KEYS.some((rk) => upper.includes(rk))) {
      out[k] = 'REDACTED'
    } else {
      out[k] = v
    }
  }
  return out
}

export async function runCommand(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs?: number; env?: Record<string, string> },
  /**
   * Optional callback invoked for interactive terminal output. The callback
   * receives the output line and a responder function which can be used to
   * write input back into the running process (e.g. to accept prompts).
   *
   * Adapters (codex/copilot) can pass this in to implement deterministic
   * interactive flows. The shell runner remains provider-agnostic.
   */
  onInteractive?: (line: string, respond: (input: string) => Promise<void>) => void | Promise<void>
) {
  // Only honor explicit per-invocation env passed in opts.env. Tests may still
  // set process.env to control behavior; we read test-only flags from both.
  // opts.env may be passed through to child processes but we don't need to merge it here
  // Command execution helper: executes commands unconditionally and
  // streams stdout/stderr back to the parent process while returning
  // captured output. Tests may still use replay adapters to avoid side-effects.
  try {
    await import('../config')
  } catch {}

  // If we're invoking the external 'codex' CLI, prefer spawning it in a
  // pseudo-terminal so the CLI sees a TTY. Some providers or the CLI itself
  // require a terminal and will error with "stdout is not a terminal"
  // when run under pipes (typical in test runners). Use node-pty which is a
  // project dependency. For all other commands, keep using execa.
  if (cmd === 'codex') {
    try {
      console.error('debug: runCommand invoked for codex with args:', JSON.stringify(args || []))
    } catch {}
    // If this invocation looks like the non-interactive exec/json path,
    // prefer execa (pipes). Only use a PTY for interactive runs where the
    // CLI expects a terminal. This avoids unnecessary TTY errors for
    // non-interactive invocations used in tests.
    const argLower = (args || []).map(String).join(' ').toLowerCase()
    const looksNonInteractive =
      argLower.includes('exec') || argLower.includes('--json') || argLower.includes('--output json')
    if (!looksNonInteractive) {
      // Always attempt to spawn codex in a pseudo-terminal so the vendored
      // wrapper (which uses stdio: 'inherit') sees a TTY. Fall back to execa
      // if PTY spawning fails for any reason.
      try {
        // dynamic import so this file still works if node-pty isn't available
        const pty = await import('node-pty')
        // Determine the spawn function across possible module shapes
        const maybeDefault = (pty as any).default || pty
        const spawnFn = (maybeDefault && (maybeDefault.spawn || maybeDefault)) || (pty as any).spawn
        if (typeof spawnFn !== 'function') {
          throw new Error('node-pty import did not expose a spawn function')
        }

        console.error('debug: spawning codex in pty (node-pty detected)')
        return await new Promise<any>((resolve) => {
          const cols = (process.stdout && (process.stdout as any).columns) || 80
          const rows = (process.stdout && (process.stdout as any).rows) || 24
          // Merge host PATH/HOME so spawned binaries can be located. Allow
          // opts.env to override these values when explicitly provided.
          const env = Object.assign({}, { PATH: process.env.PATH, HOME: process.env.HOME }, opts.env || {})
          // Ensure a TERM so spawned process believes it's in a real terminal
          if (!env.TERM) env.TERM = 'xterm-256color'
          // Provide common terminal size vars which some CLIs inspect
          env.COLUMNS = String((process.stdout && (process.stdout as any).columns) || 80)
          env.LINES = String((process.stdout && (process.stdout as any).rows) || 24)
          try {
            console.error('debug: pty env for codex', Object.fromEntries(Object.entries(env).slice(0, 30)))
          } catch {}
          // spawnFn may be the module itself or an object with spawn()
          const p = spawnFn(cmd, args, {
            cwd: opts.cwd,
            env,
            cols,
            rows
          })

          let buf = ''
          // stream out and capture
          try {
            if (typeof p.onData === 'function') {
              // responder writes into the PTY
              const responder = async (input: string) => {
                try {
                  if (typeof p.write === 'function') p.write(String(input))
                  else if (p.stdin && typeof p.stdin.write === 'function') p.stdin.write(String(input))
                } catch {}
              }
              p.onData((data: string) => {
                const s = String(data)
                buf += s
                try {
                  process.stdout.write(s)
                } catch {}
                try {
                  for (const line of s.split(/\r?\n/)) {
                    if (!line) continue
                    console.error(`[child stdout] ${line}`)
                    // Notify interactive callback if provided
                    try {
                      if (onInteractive && typeof onInteractive === 'function') {
                        // fire-and-forget; allow adapters to respond asynchronously
                        void Promise.resolve(onInteractive(line, responder))
                      }
                    } catch {}
                  }
                } catch {}

                // Some native CLIs probe the terminal for cursor position using
                // the Device Status Request (DSR) sequence ESC[6n. Many PTY
                // emulators (and node-pty) do not automatically respond. If we
                // see a DSR request from the child, synthesize a terminal
                // response (ESC[<row>;<col>R) so the child won't time out.
                try {
                  if (s.includes('\x1b[6n') || s.includes('\u001b[6n')) {
                    // respond with a safe cursor position (row=1, col=1)
                    try {
                      if (typeof p.write === 'function') {
                        p.write('\x1b[1;1R')
                      } else if (p.stdin && typeof p.stdin.write === 'function') {
                        p.stdin.write('\x1b[1;1R')
                      }
                    } catch {}
                  }
                } catch {}
                // TODO: adapters should decide how to respond to interactive
                // sandbox/confirmation prompts (e.g. codex adapter). Shell
                // runner must not contain provider-specific auto-approve
                // heuristics. If automation needs auto-approval, implement it
                // in the respective adapter or test harness.
              })
            } else if (p.stdout && typeof p.stdout.on === 'function') {
              const responder = async (input: string) => {
                try {
                  if (p.stdin && typeof p.stdin.write === 'function') p.stdin.write(String(input))
                } catch {}
              }
              p.stdout.on('data', (chunk: any) => {
                const s = String(chunk)
                buf += s
                try {
                  process.stdout.write(s)
                } catch {}
                try {
                  for (const line of s.split(/\r?\n/)) {
                    if (!line) continue
                    console.error(`[child stdout] ${line}`)
                    try {
                      if (onInteractive && typeof onInteractive === 'function') {
                        void Promise.resolve(onInteractive(line, responder))
                      }
                    } catch {}
                  }
                } catch {}
              })
            } else {
              console.error('debug: pty spawn returned unknown process shape', Object.keys(p || {}))
            }
          } catch (e) {
            try {
              console.error('debug: error wiring pty output handler', String(e))
            } catch {}
          }

          if (typeof p.onExit === 'function') {
            p.onExit((ev: any) => {
              try {
                console.error('debug: full pty buffer on exit:\n' + String(buf).slice(0, 20_000))
              } catch {}
              resolve({ stdout: buf, stderr: '', exitCode: ev?.exitCode ?? 0 })
            })
          } else if (p.then) {
            // some shapes might be promise-like — wait and then resolve
            ;(p as any)
              .then((r: any) => resolve({ stdout: buf, stderr: '', exitCode: r?.exitCode ?? 0 }))
              .catch((err: any) => resolve({ stdout: buf, stderr: String(err), exitCode: 1 }))
          } else {
            console.error('debug: pty spawn returned process without onExit; falling back to execa')
          }
          // Note: avoid installing additional timeouts here because test runners
          // may replace global timer APIs. Let the PTY resolve via onExit. If a
          // caller needs a timeout it can enforce one at a higher level.
        })
      } catch (e: any) {
        // if pty spawning fails for any reason, fall back to execa path below
        try {
          console.error('failed to spawn codex in pty, falling back to execa:', e && e.stack ? e.stack : String(e))
        } catch {}
      }
    }
  }

  const cp = execa(cmd, args, {
    cwd: opts.cwd,
    // default to 15 minutes for CLI operations
    timeout: opts.timeoutMs ?? 15 * 60_000,
    env: opts.env,
    reject: false
  })
  // Always pipe child stdout/stderr to parent process for live inspection
  // while still collecting the output in memory to return to callers.
  let stdoutBuf = ''
  let stderrBuf = ''

  if (cp.stdout) {
    try {
      cp.stdout.setEncoding('utf8')
    } catch {}
    const responder = async (input: string) => {
      try {
        if (cp.stdin && typeof cp.stdin.write === 'function') cp.stdin.write(String(input))
      } catch {}
    }
    cp.stdout.on('data', (chunk: any) => {
      const s = String(chunk)
      console.log('[shell stdout]', s)
      stdoutBuf += s
      try {
        process.stdout.write(s)
      } catch {}
      try {
        // Also emit to console.error with a short prefix so test runners like
        // Vitest (which capture console output) will include the streamed
        // LLM output in test logs for easier inspection.
        for (const line of s.split(/\r?\n/)) {
          if (!line) continue
          console.error(`[child stdout] ${line}`)
          try {
            if (onInteractive && typeof onInteractive === 'function') {
              void Promise.resolve(onInteractive(line, responder))
            }
          } catch {}
        }
      } catch {}
    })
  }
  if (cp.stderr) {
    try {
      cp.stderr.setEncoding('utf8')
    } catch {}
    cp.stderr.on('data', (chunk: any) => {
      const s = String(chunk)
      stderrBuf += s
      try {
        process.stderr.write(s)
      } catch {}
      try {
        for (const line of s.split(/\r?\n/)) {
          if (!line) continue
          console.error(`[child stderr] ${line}`)
        }
      } catch {}
    })
  }

  const res = await cp
  return {
    stdout: stdoutBuf || res.stdout || '',
    stderr: stderrBuf || res.stderr || '',
    exitCode: res.exitCode ?? 0
  }
}

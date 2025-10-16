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
  opts: { cwd: string; timeoutMs?: number; env?: Record<string, string> }
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

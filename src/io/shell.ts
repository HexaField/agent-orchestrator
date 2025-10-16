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
  const mergedEnv = Object.assign({}, opts.env || {}) as Record<string, string | undefined>

  // Safety: detect CI only from explicit invocation env or well-known test flags.
  const isCI = Boolean(mergedEnv['CI'] || mergedEnv['GITHUB_ACTIONS'] || mergedEnv['CI_SERVER'])
  // ALLOW_COMMANDS and DRY_RUN are project-level configuration. Prefer
  // values from .agent/config.json when present; fall back to opts.env only.
  // Start with explicit per-invocation env values when provided
  // Defaults: prefer explicit per-invocation env; project config may override below
  let allow = String(opts.env?.ALLOW_COMMANDS ?? '').trim() === '1'
  let dryRun = String(opts.env?.DRY_RUN ?? '').trim() === '1'
  try {
    const { getEffectiveConfig } = await import('../config')
    const cfg = await getEffectiveConfig(opts.cwd)
    if (cfg) {
      // Prefer an explicit input.env override; otherwise use the project config values
      allow = String(opts.env?.ALLOW_COMMANDS ?? cfg.ALLOW_COMMANDS ?? '').trim() === '1'
      dryRun = String(opts.env?.DRY_RUN ?? (cfg as any).DRY_RUN ?? '').trim() === '1'
    }
  } catch {}

  // Test override: force allowing commands in test environments when requested.
  // This is useful in e2e harnesses where an external CI flag or sandboxing
  // falsely causes child runs to be treated as read-only. Set FORCE_ALLOW_COMMANDS=1
  // in opts.env or process.env to enable.
  const forceAllow = String(opts.env?.FORCE_ALLOW_COMMANDS ?? process.env['FORCE_ALLOW_COMMANDS'] ?? '').trim() === '1'
  if (forceAllow) {
    // clear CI detection in the merged env so downstream checks don't pick it up
    mergedEnv['CI'] = undefined
  }

  // If FORCE_ALLOW_COMMANDS was set, force allow and ignore CI/dry-run
  const effectiveIsCI = forceAllow ? false : isCI
  if (forceAllow) {
    allow = true
    dryRun = false
  }

  if (!allow || effectiveIsCI || dryRun) {
    // do not execute; return a simulated dry-run result
    return { stdout: `DRY-RUN: ${cmd} ${args.join(' ')}`.slice(0, 10 * 1024), stderr: '', exitCode: 0 }
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
    cp.stdout.on('data', (chunk: any) => {
      const s = String(chunk)
      console.log(s)
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

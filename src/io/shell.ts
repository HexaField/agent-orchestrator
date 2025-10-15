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

  // Test hook: if MOCK_RUN_COMMAND is present, return its JSON-parsed value (stringified)
  // Test hook: if MOCK_RUN_COMMAND is present in either merged env or opts.env, return its JSON-parsed value
  // Test hook: MOCK_RUN_COMMAND may be passed via opts.env; fall back to process.env
  const mockCmd = opts.env?.MOCK_RUN_COMMAND || process.env['MOCK_RUN_COMMAND'] || mergedEnv['MOCK_RUN_COMMAND']
  if (mockCmd) {
    try {
      const js = JSON.parse(mockCmd)
      return { stdout: String(js.stdout ?? ''), stderr: String(js.stderr ?? ''), exitCode: Number(js.exitCode ?? 0) }
    } catch {}
  }

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
    timeout: opts.timeoutMs ?? 10 * 60_000,
    env: opts.env,
    reject: false
  })
  const res = await cp
  return {
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    exitCode: res.exitCode ?? 0
  }
}

import { execa } from 'execa'

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
  const env = Object.assign({}, process.env, opts.env || {}) as Record<string, string | undefined>

  // Safety: default to disallow running commands in CI unless explicitly enabled
  const isCI = Boolean(env['CI'] || env['GITHUB_ACTIONS'] || env['CI_SERVER'])
  // AO_ALLOW_COMMANDS must be explicitly set to '1' to allow command execution
  const allow = String(env['AO_ALLOW_COMMANDS'] || '').trim() === '1'
  const dryRun = String(env['AO_DRY_RUN'] || '').trim() === '1'

  // Test hook: if MOCK_RUN_COMMAND is present, return its JSON-parsed value (stringified)
  if (env['MOCK_RUN_COMMAND']) {
    try {
      const js = JSON.parse(env['MOCK_RUN_COMMAND'])
      return { stdout: String(js.stdout ?? ''), stderr: String(js.stderr ?? ''), exitCode: Number(js.exitCode ?? 0) }
    } catch {}
  }

  if (!allow || isCI || dryRun) {
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

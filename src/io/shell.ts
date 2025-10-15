import { execa } from 'execa'
import { readProjectConfig } from '../config'

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
  const mergedEnv = Object.assign({}, process.env, opts.env || {}) as Record<string, string | undefined>

  // Safety: default to disallow running commands in CI unless explicitly enabled
  const isCI = Boolean(mergedEnv['CI'] || mergedEnv['GITHUB_ACTIONS'] || mergedEnv['CI_SERVER'])
  // ALLOW_COMMANDS and DRY_RUN are project-level configuration. Prefer
  // values from .agent/config.json when present; fall back to opts.env only.
  // Start with explicit per-invocation env values when provided
  let allow = String(opts.env?.ALLOW_COMMANDS ?? '').trim() === '1'
  let dryRun = String(opts.env?.DRY_RUN ?? '').trim() === '1'
  try {
    const cfg = await readProjectConfig(opts.cwd)
    if (cfg) {
      // Prefer an explicit input.env override; otherwise use the project config values
      allow = String(opts.env?.ALLOW_COMMANDS ?? (cfg as any).ALLOW_COMMANDS ?? '').trim() === '1'
      dryRun = String(opts.env?.DRY_RUN ?? (cfg as any).DRY_RUN ?? '').trim() === '1'
    }
  } catch {}

  // Test hook: if MOCK_RUN_COMMAND is present, return its JSON-parsed value (stringified)
  // Test hook: if MOCK_RUN_COMMAND is present in either merged env or opts.env, return its JSON-parsed value
  const mockCmd = opts.env?.MOCK_RUN_COMMAND || mergedEnv['MOCK_RUN_COMMAND']
  if (mockCmd) {
    try {
      const js = JSON.parse(mockCmd)
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

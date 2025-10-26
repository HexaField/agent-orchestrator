import type { ExecResult } from '../adapters/exec/interface'

export type CommandSpec = {
  name: string
  cmd: string
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  /** allowed exit codes (defaults to [0]) */
  acceptExitCodes?: number[]
}

export type CheckResult = {
  name: string
  status: 'pass' | 'fail'
  result: ExecResult
}

export type VerificationResult = {
  checks: CheckResult[]
}

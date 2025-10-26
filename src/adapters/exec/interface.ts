export type ExecOptions = {
  cmd: string
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
}

export type ExecResult = {
  code: number | null
  stdout: string
  stderr: string
  durationMs: number
  signal?: NodeJS.Signals | null
  timedOut?: boolean
  error?: string
}

export interface ExecAdapter {
  run(opts: ExecOptions): Promise<ExecResult>
}

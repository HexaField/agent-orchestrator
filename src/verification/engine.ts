import fs from 'fs'
import path from 'path'
import nodeProcess from '../adapters/exec/nodeProcess'
import { appendProvenanceEvent } from '../logging/provenance'
import type { CheckResult, CommandSpec, VerificationResult } from './interface'

export type EngineOptions = {
  provenancePath?: string
}

/**
 * Run the given commands sequentially and record provenance events.
 */
export async function runVerification(
  commands: CommandSpec[],
  options: EngineOptions = {}
): Promise<VerificationResult> {
  const checks: CheckResult[] = []
  const provPath = options.provenancePath || path.join(process.cwd(), '.agent_provenance.log')

  // ensure provenance directory exists
  try {
    fs.mkdirSync(path.dirname(provPath), { recursive: true })
  } catch (_e) {
    // ignore
  }

  for (const cmd of commands) {
    const start = Date.now()
    const execOpts = { cmd: cmd.cmd, cwd: cmd.cwd, env: cmd.env, timeoutMs: cmd.timeoutMs }
    let result
    try {
      result = await nodeProcess.run(execOpts)
    } catch (err) {
      // shouldn't happen because nodeProcess resolves on error, but guard anyway
      result = { code: null, stdout: '', stderr: String(err), durationMs: Date.now() - start }
    }

    const accepted = cmd.acceptExitCodes ?? [0]
    const passed = typeof result.code === 'number' && accepted.includes(result.code)

    const check = { name: cmd.name, status: (passed ? 'pass' : 'fail') as 'pass' | 'fail', result }
    checks.push(check)

    // write provenance event (synchronously to make tests deterministic)
    appendProvenanceEvent(provPath, {
      runId: undefined,
      name: cmd.name,
      type: 'verification.check',
      payload: {
        cmd: cmd.cmd,
        cwd: cmd.cwd,
        env: cmd.env,
        timeoutMs: cmd.timeoutMs,
        acceptExitCodes: accepted,
        result
      }
    })
  }

  return { checks }
}

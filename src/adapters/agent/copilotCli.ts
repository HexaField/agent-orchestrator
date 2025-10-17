import { runCommand } from '../../io/shell'
import type { AgentAdapter } from '../../types/adapters'

export function createCopilotCli(): AgentAdapter {
  return {
    name: 'copilot-cli',
    async run(input) {
      // Try common copilot CLI invocation patterns in order of preference.
      const tries = [
        { cmd: 'copilot', args: ['suggest', '--prompt', input.prompt] },
        { cmd: 'gh', args: ['copilot', 'suggest', '--prompt', input.prompt] }
      ]
      let lastErr: unknown = null
      for (const t of tries) {
        try {
          const res = await runCommand(
            t.cmd,
            t.args,
            { cwd: input.cwd, timeoutMs: input.timeoutMs, env: input.env },
            // simple responder: reply with an empty string to any interactive prompt
            (_line: string, respond: (input: string) => Promise<void>) => {
              // temporary simple responder: reply with an empty string
              void respond('')
            }
          )
          // normalize output
          return { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode }
        } catch (err) {
          // record the last error so we can surface helpful diagnostics
          lastErr = err
          // try next
        }
      }

      // Build a compact error message from the last failure if present.
      const errMsg = lastErr
        ? String((lastErr as any)?.stderr ?? (lastErr as any)?.message ?? lastErr)
        : 'copilot CLI not available'

      return { stdout: '', stderr: `copilot CLI not available: ${errMsg}`, exitCode: 1 }
    }
  }
}

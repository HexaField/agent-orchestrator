import { runCommand } from '../../io/shell'
import type { AgentAdapter } from '../../types/adapters'

export function createCodexCli(): AgentAdapter {
  return {
    name: 'codex-cli',
    async run(input) {
      const args = ['--prompt', input.prompt]
      return runCommand('codex', args, {
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
        env: input.env
      })
    }
  }
}

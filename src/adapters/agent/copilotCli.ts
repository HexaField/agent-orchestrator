import { runCommand } from '../../io/shell'
import type { AgentAdapter } from '../../types/adapters'

export function createCopilotCli(): AgentAdapter {
  return {
    name: 'copilot-cli',
    async run(input) {
      // Adjust to actual copilot CLI; placeholder uses gh copilot suggest
      const args = ['copilot', 'suggest', '--prompt', input.prompt]
      return runCommand('gh', args, {
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
        env: input.env
      })
    }
  }
}

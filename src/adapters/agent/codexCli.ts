import type { AgentAdapter } from '../../types/adapters';
import { runCommand } from '../../io/shell';

export function createCodexCli(): AgentAdapter {
  return {
    name: 'codex-cli',
    async run(input) {
      const args = ['--prompt', input.prompt];
      return runCommand('codex', args, {
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
        env: input.env,
      });
    },
  };
}

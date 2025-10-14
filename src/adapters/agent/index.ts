import type { AgentAdapter } from '../../types/adapters.js';
import { createCodexCli } from './codexCli.js';
import { createCopilotCli } from './copilotCli.js';
import { createCustom } from './custom.js';

export function getAgentAdapter(name: string): AgentAdapter {
  switch (name) {
    case 'codex-cli':
      return createCodexCli();
    case 'copilot-cli':
      return createCopilotCli();
    case 'custom':
      return createCustom();
    default:
      throw new Error(`Unknown agent adapter: ${name}`);
  }
}

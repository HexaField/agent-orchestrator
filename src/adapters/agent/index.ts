import type { AgentAdapter } from '../../types/adapters'
import { createCodexCli } from './codexCli'
import { createCopilotCli } from './copilotCli'
import { createCustom } from './custom'
import { createHttpAgent } from './http'
import { createReplayAgent } from './replay'

export function getAgentAdapter(name: string): AgentAdapter {
  switch (name) {
    case 'codex-cli':
      return createCodexCli()
    case 'copilot-cli':
      return createCopilotCli()
    case 'custom':
      return createCustom()
    case 'http':
      return createHttpAgent()
    case 'agent-replay':
      return createReplayAgent()
    default:
      throw new Error(`Unknown agent adapter: ${name}`)
  }
}

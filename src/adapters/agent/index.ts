import type { AgentAdapter } from '../../types/adapters'
import { createCodexCli } from './codexCli'
import { createCopilotCli } from './copilotCli'
import { createCustom } from './custom'
import { createHttpAgent } from './http'

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
    default:
      throw new Error(`Unknown agent adapter: ${name}`)
  }
}

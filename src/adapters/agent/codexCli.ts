import { runCommand } from '../../io/shell'
import type { AgentAdapter } from '../../types/adapters'

export function createCodexCli(): AgentAdapter {
  return {
    name: 'codex-cli',
    async run(input) {
      const args = ['--prompt', input.prompt]

      // Respect a VLLM or custom OpenAI-compatible base URL if provided.
      // The adapter will pass through an OPENAI_API_BASE environment variable
      // which many OpenAI-compatible CLIs (and Codex-compatible tooling) honor.
      const env = Object.assign({}, input.env)

      // Priority: explicit CODEX_API_BASE -> VLLM_SERVER_URL -> LLM_ENDPOINT
      const codeXBase = input.env?.CODEX_API_BASE || input.env?.VLLM_SERVER_URL || input.env?.LLM_ENDPOINT
      if (codeXBase) {
        // Ensure the URL looks like a base that the CLI expects (no path mangling).
        // If a path like /v1 was provided, keep it; otherwise the CLI will append paths.
        env.OPENAI_API_BASE = codeXBase
      }

      return runCommand('codex', args, {
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
        env
      })
    }
  }
}

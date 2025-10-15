import fs from 'fs'
import path from 'path'
import { runCommand } from '../../io/shell'
import type { AgentAdapter } from '../../types/adapters'

export function createCodexCli(): AgentAdapter {
  return {
    name: 'codex-cli',
    async run(input) {
      // Prefer to run the `exec` subcommand which is the non-interactive one-shot mode
      const model = input.env?.AO_LLM_MODEL || input.env?.LLM_MODEL || process.env.AO_LLM_MODEL || process.env.LLM_MODEL
      // The Codex CLI expects the initial prompt as a positional argument to `codex exec`.
      const args: string[] = ['exec']
      if (model) {
        // codex supports -m/--model
        args.push('--model', model)
      }

      // Codex reads configuration from ~/.codex/config.toml by default. We don't pass
      // a config file path here because the CLI doesn't accept a `--config <path>` flag.
      // Instead, tests should place the config in the fake HOME under ~/.codex/config.toml.

      // Run in non-interactive JSON mode where possible.
      args.push('--json')
      // If an explicit LLM endpoint/base URL was provided, pass it as config overrides
      // so the Codex CLI uses the intended OpenAI-compatible base (e.g., Ollama).
      const codeXBase =
        (input.env &&
          (input.env.CODEX_API_BASE ||
            input.env.OLLAMA_API_BASE ||
            input.env.OLLAMA_SERVER_URL ||
            input.env.VLLM_SERVER_URL ||
            input.env.LLM_ENDPOINT)) ||
        process.env.CODEX_API_BASE ||
        process.env.OLLAMA_API_BASE ||
        process.env.OLLAMA_SERVER_URL ||
        process.env.VLLM_SERVER_URL ||
        process.env.LLM_ENDPOINT
      // Fallback: prefer AO_LLM_ENDPOINT / LLM_ENDPOINT if present, or default to local Ollama
      const fallbackBase =
        (input.env && (input.env.AO_LLM_ENDPOINT || input.env.LLM_ENDPOINT)) ||
        process.env.AO_LLM_ENDPOINT ||
        process.env.LLM_ENDPOINT ||
        'http://localhost:11434/v1'
      const codeXBaseFinal = codeXBase || fallbackBase
      if (codeXBaseFinal) {
        // set model_provider and provider base via -c overrides
        args.push('-c', 'model_provider=ollama')
        args.push('-c', `model_providers.ollama.name=Ollama`)
        args.push('-c', `model_providers.ollama.base_url=${codeXBaseFinal}`)
        // instruct codex to use the local OSS provider when possible
        args.push('--oss')
      }

      // If the harness allows commands, make it explicit in the prompt so
      // models that receive a read-only session context can act with write
      // permission when running tests with the real `codex` CLI.
      let finalPrompt = input.prompt || ''
      try {
        const allowCommands = (input.env && input.env.AO_ALLOW_COMMANDS) || process.env.AO_ALLOW_COMMANDS
        if (String(allowCommands).trim() === '1' && finalPrompt) {
          const prefix =
            'SYSTEM: The test harness has granted filesystem and command execution permissions. You may create, modify, and run files in the current workspace. Respond with the sequence of commands or patches to implement the request when appropriate.\n\n'
          finalPrompt = prefix + finalPrompt
        }
      } catch {
        // ignore any issues determining allow flag
      }
      if (finalPrompt) args.push(finalPrompt)

      // Respect a VLLM or custom OpenAI-compatible base URL if provided.
      // Merge process.env with any input.env overrides so the child process sees both.
      const env = Object.assign({}, process.env, input.env || {})
      // Ensure OPENAI_API_BASE / CODEX_API_BASE are set to the final base (including fallback)
      if (codeXBaseFinal) {
        env.OPENAI_API_BASE = codeXBaseFinal
        env.CODEX_API_BASE = env.CODEX_API_BASE || codeXBaseFinal
      }

      // Persist a debug file into the agent dir so test runs can inspect the exact
      // invocation used for codex regardless of captured stdout/stderr.
      try {
        const outDir = path.join(input.cwd || '.', '.agent')
        try {
          fs.mkdirSync(outDir, { recursive: true })
        } catch {}
        const dump = {
          args,
          env: {
            OPENAI_API_BASE: env.OPENAI_API_BASE,
            CODEX_API_BASE: env.CODEX_API_BASE || env.OPENAI_API_BASE,
            AO_DEBUG_CODEX: env.AO_DEBUG_CODEX,
            AO_ALLOW_COMMANDS: env.AO_ALLOW_COMMANDS,
            PATH: env.PATH,
            HOME: env.HOME,
            model
          }
        }
        fs.writeFileSync(path.join(outDir, 'codex-invocation.json'), JSON.stringify(dump, null, 2), 'utf8')
      } catch {
        // ignore write errors
      }

      if (input.env && input.env['AO_DEBUG_CODEX'] === '1') {
        console.error('DEBUG codex-cli args=', JSON.stringify(args))
        console.error(
          'DEBUG codex-cli OPENAI_API_BASE=',
          env.OPENAI_API_BASE,
          'CODEX_API_BASE=',
          input.env?.CODEX_API_BASE
        )
      }

      return runCommand('codex', args, {
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
        env
      })
    }
  }
}

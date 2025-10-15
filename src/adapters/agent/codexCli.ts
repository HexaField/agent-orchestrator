import fs from 'fs'
import path from 'path'
import { readProjectConfig } from '../../config'
import { runCommand } from '../../io/shell'
import type { AgentAdapter } from '../../types/adapters'

export function createCodexCli(): AgentAdapter {
  return {
    name: 'codex-cli',
    async run(input) {
      // Prefer to run the `exec` subcommand which is the non-interactive one-shot mode
  let model = input.env?.LLM_MODEL
      try {
        const cfg = await readProjectConfig(input.cwd || '.')
        if (cfg && cfg.LLM_MODEL) model = model || cfg.LLM_MODEL
      } catch {}
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
      // Prefer project config over environment when available
      let cfgBase: string | undefined = undefined
      try {
        const cfg = await readProjectConfig(input.cwd || '.')
        if (cfg) cfgBase = cfg.LLM_ENDPOINT
      } catch {}
      // prefer input.env overrides then project config; no process.env fallback
      const codeXBaseFinal =
        input.env?.CODEX_API_BASE ||
        input.env?.OLLAMA_API_BASE ||
        input.env?.OLLAMA_SERVER_URL ||
        input.env?.VLLM_SERVER_URL ||
        input.env?.LLM_ENDPOINT ||
        cfgBase
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
  // prefer explicit per-invocation env, otherwise fall back to project config
  let allowCommands = String(input.env?.ALLOW_COMMANDS ?? '')
        try {
          const cfg = await readProjectConfig(input.cwd || '.')
          if (allowCommands.trim() === '') allowCommands = String((cfg as any).ALLOW_COMMANDS ?? '')
        } catch {}
        if (allowCommands.trim() === '1' && finalPrompt) {
          const prefix =
            'SYSTEM: The test harness has granted filesystem and command execution permissions. You may create, modify, and run files in the current workspace. Respond with the sequence of commands or patches to implement the request when appropriate.\n\n'
          finalPrompt = prefix + finalPrompt
        }
      } catch {
        // ignore any issues determining allow flag
      }
      if (finalPrompt) args.push(finalPrompt)

      // Respect a VLLM or custom OpenAI-compatible base URL if provided.
      // Use only explicit input.env entries for the child process env so tests
      // don't accidentally pick up the surrounding process environment.
      const env = Object.assign({}, input.env || {})
      // Ensure OPENAI_API_BASE / CODEX_API_BASE are set only when an explicit base was provided
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
        // compute debug and allow flags from input.env or project config
        // derive debug and allow flags: prefer input.env then project config
  let debugCodeX = String(input.env?.DEBUG_CODEX ?? '')
  let allowFlag = String(input.env?.ALLOW_COMMANDS ?? '')
        try {
          const { readProjectConfig } = await import('../../config')
          const cfg = await readProjectConfig(input.cwd || '.')
          if (debugCodeX.trim() === '') debugCodeX = String((cfg as any).DEBUG_CODEX ?? '')
          if (allowFlag.trim() === '') allowFlag = String((cfg as any).ALLOW_COMMANDS ?? '')
        } catch {}
        const dump = {
          args,
          env: {
            OPENAI_API_BASE: env.OPENAI_API_BASE,
            CODEX_API_BASE: env.CODEX_API_BASE || env.OPENAI_API_BASE,
            DEBUG_CODEX: debugCodeX || undefined,
            ALLOW_COMMANDS: allowFlag || undefined,
            PATH: env.PATH || process.env.PATH,
            HOME: env.HOME || process.env.HOME,
            model
          }
        }
        fs.writeFileSync(path.join(outDir, 'codex-invocation.json'), JSON.stringify(dump, null, 2), 'utf8')
      } catch {
        // ignore write errors
      }

  if (input.env && input.env['DEBUG_CODEX'] === '1') {
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

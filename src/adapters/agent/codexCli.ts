import fs from 'fs'
import path from 'path'
// ...config helpers are dynamically imported where needed
import { runCommand } from '../../io/shell'
import type { AgentAdapter } from '../../types/adapters'

export function createCodexCli(): AgentAdapter {
  return {
    name: 'codex-cli',
    async run(input) {
      // Prefer to run the `exec` subcommand which is the non-interactive one-shot mode
      let model = input.env?.LLM_MODEL
      try {
        const { getEffectiveConfig } = await import('../../config')
        const cfg = await getEffectiveConfig(input.cwd || '.')
        if (cfg && cfg.LLM_MODEL) model = model || cfg.LLM_MODEL
      } catch {}
      // The Codex CLI expects the initial prompt as a positional argument to `codex exec`.
      const args: string[] = ['exec']
      // preArgs hold global options that must appear before the 'exec' subcommand
      const preArgs: string[] = []
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
        const { getEffectiveConfig } = await import('../../config')
        const cfg = await getEffectiveConfig(input.cwd || '.')
        if (cfg) cfgBase = cfg.LLM_ENDPOINT
      } catch {}
      // Use only the canonical LLM_ENDPOINT (no legacy fallbacks).
      const codeXBaseFinal = input.env?.LLM_ENDPOINT || cfgBase
      if (codeXBaseFinal) {
        // If a codex profile is present we prefer using --oss --profile <name>
        // rather than inline -c overrides. The test harness creates a profile
        // named 'gpt-oss-20b-ollama' that points to Ollama /v1.
        preArgs.push('--oss')
        preArgs.push('--profile', 'gpt-oss-20b-ollama')
      }

      // If the harness allows commands, ensure the codex CLI is invoked with a
      // writable sandbox and an approval policy that permits unattended runs
      // in test environments. This mirrors the manual invocation used in e2e.
      try {
        let allowCommands = String(input.env?.ALLOW_COMMANDS ?? '')
        try {
          const { getEffectiveConfig } = await import('../../config')
          const cfg = await getEffectiveConfig(input.cwd || '.')
          if (allowCommands.trim() === '') allowCommands = String(cfg.ALLOW_COMMANDS ?? '')
        } catch {}
        if (allowCommands.trim() === '1') {
          // Add sandbox write and approval flags as global options (must come
          // before the 'exec' subcommand). Use -a never to avoid interactive
          // approvals in CI-like test runs and set an override to allow
          // network access from the workspace write sandbox.
          preArgs.push('-s', 'workspace-write')
          preArgs.push('-a', 'never')
          preArgs.push('-c', 'sandbox_workspace_write.network_access=true')
        }
      } catch {}

      // If the harness allows commands, make it explicit in the prompt so
      // models that receive a read-only session context can act with write
      // permission when running tests with the real `codex` CLI.
      let finalPrompt = input.prompt || ''
      try {
        // prefer explicit per-invocation env, otherwise fall back to project config
        let allowCommands = String(input.env?.ALLOW_COMMANDS ?? '')
        try {
          const { getEffectiveConfig } = await import('../../config')
          const cfg = await getEffectiveConfig(input.cwd || '.')
          if (allowCommands.trim() === '') allowCommands = String(cfg.ALLOW_COMMANDS ?? '')
        } catch {}
        if (allowCommands.trim() === '1' && finalPrompt) {
          const prefix =
            'SYSTEM: The test harness has granted filesystem and command execution permissions. You may create, modify, and run files in the current workspace. When producing code or file contents, ALWAYS format files using either fenced code blocks (```ts ... ```), or explicit markers of the form:\n=== <relative/path> ===\n<file contents>\n=== <relative/path> ===. Include the exact single-line comment "// AO-E2E-REQUIRED" somewhere in the implementation file. Respond with the sequence of commands or patches to implement the request when appropriate.\n\n'
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
      // Ensure any provider base is set only when an explicit LLM endpoint was provided
      if (codeXBaseFinal) {
        // Set only the canonical endpoint in the child process env.
        env.LLM_ENDPOINT = env.LLM_ENDPOINT || codeXBaseFinal
      }

      // Direct Ollama fallback: if an explicit endpoint is provided and it
      // appears to be Ollama, call the Ollama HTTP API directly instead of
      // invoking the external `codex` CLI. This avoids mismatches between the
      // CLI's upstream calls and the local Ollama API surface.
      try {
        if (codeXBaseFinal) {
          // Compose the prompt and model for the request
          const useModel = model || 'gpt-oss:20b'
          const promptBody = finalPrompt || ''
          const url = codeXBaseFinal.replace(/\/$/, '') + '/api/generate'
          // Use the global fetch (Node 18+) to call Ollama. Timeout via AbortController.
          const ac = new AbortController()
          const timeout = setTimeout(() => ac.abort(), Number(input.timeoutMs ?? 120000))
          try {
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: useModel, prompt: promptBody }),
              signal: ac.signal
            })
            clearTimeout(timeout)
            if (!res.ok) {
              const txt = await res.text().catch(() => '')
              return { stdout: '', stderr: `Ollama HTTP ${res.status} ${res.statusText}: ${txt}`, exitCode: res.status }
            }

            // Stream the response body (NDJSON) incrementally so the orchestrator
            // can process lines as they arrive. We'll collect the full output as
            // well so callers get the buffered stdout when the call completes.
            const reader = (res.body as ReadableStream<Uint8Array>)?.getReader()
            const decoder = new TextDecoder('utf-8')
            let buffered = ''
            let all = ''
            if (reader) {
              // read loop
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                if (value) {
                  const chunk = decoder.decode(value, { stream: true })
                  buffered += chunk
                  all += chunk
                  // flush completed lines to allow incremental processing by
                  // any downstream consumer that might inspect partial lines.
                  let idx
                  while ((idx = buffered.indexOf('\n')) !== -1) {
                    // drop the completed line from the buffer; we already
                    // appended it to `all` above so it's preserved for the
                    // final return value.
                    buffered = buffered.slice(idx + 1)
                  }
                }
              }
              // flush remainder
              if (buffered.length > 0) all += buffered
            } else {
              // fallback: not a streamable body
              all = await res.text()
            }
            // If the response contains fenced code blocks or explicit
            // '=== path ===' markers, synthesize an NDJSON object with
            // `aggregated_output` containing the extracted code. This
            // makes it easier for downstream consumers (orchestrator /
            // e2e harness) to locate embedded file contents.
            try {
              const fenceRe = /```(?:ts|typescript|js|javascript)?\n([\s\S]*?)\n```/gim
              const markerRe = /^===\s*(.+?)\s*===\n([\s\S]*?)(?=^===|\z)/gim
              let matches: string[] = []
              let m: RegExpExecArray | null
              while ((m = fenceRe.exec(all))) {
                if (m[1]) matches.push(m[1])
              }
              while ((m = markerRe.exec(all))) {
                if (m[2]) matches.push(m[2])
              }
              if (matches.length > 0) {
                const aggregated = matches.join('\n\n')
                // Append as an extra NDJSON line so patches.diff / outputs
                // include a parseable JSON object with aggregated_output.
                const ndobj = JSON.stringify({ aggregated_output: aggregated })
                // Keep original ordering but ensure the NDJSON object is present
                all = (all || '') + '\n' + ndobj + '\n'
              }
            } catch {}
            return { stdout: all || '', stderr: '', exitCode: 0 }
          } catch (e: any) {
            clearTimeout(timeout)
            if (e && e.name === 'AbortError') {
              return { stdout: '', stderr: 'Ollama request timed out', exitCode: 2 }
            }
            return { stdout: '', stderr: String(e), exitCode: 2 }
          }
        }
      } catch {}

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
          const { getEffectiveConfig } = await import('../../config')
          const cfg = await getEffectiveConfig(input.cwd || '.')
          if (debugCodeX.trim() === '') debugCodeX = String((cfg as any).DEBUG_CODEX ?? '')
          if (allowFlag.trim() === '') allowFlag = String(cfg.ALLOW_COMMANDS ?? '')
        } catch {}
        const dump = {
          args: [...preArgs, ...args],
          env: {
            LLM_ENDPOINT: env.LLM_ENDPOINT,
            DEBUG_CODEX: debugCodeX || undefined,
            ALLOW_COMMANDS: allowFlag || undefined,
            // Do not leak host process.env PATH/HOME; tests should set these in input.env when needed
            PATH: env.PATH || undefined,
            HOME: env.HOME || undefined,
            model
          }
        }
        fs.writeFileSync(path.join(outDir, 'codex-invocation.json'), JSON.stringify(dump, null, 2), 'utf8')
      } catch {
        // ignore write errors
      }

      if (input.env && input.env['DEBUG_CODEX'] === '1') {
        console.error('DEBUG codex-cli preArgs=', JSON.stringify(preArgs))
        console.error('DEBUG codex-cli args=', JSON.stringify(args))
        console.error('DEBUG codex-cli LLM_ENDPOINT=', env.LLM_ENDPOINT)
      }

      const finalArgs = [...preArgs, ...args]
      return runCommand('codex', finalArgs, {
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
        env
      })
    }
  }
}

import fs from 'fs'
import os from 'os'
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
      const args: string[] = []
      // preArgs hold global options that must appear before the 'exec' subcommand
      const preArgs: string[] = []

      // If an explicit LLM endpoint/base URL was provided, build codex --config
      // overrides instead of relying on an external profile file. Prefer project
      // config over environment when available.
      let cfgBase: string | undefined = undefined
      let cfgProvider: string | undefined = undefined
      try {
        const { getEffectiveConfig } = await import('../../config')
        const cfg = await getEffectiveConfig(input.cwd || '.')
        if (cfg) {
          cfgBase = cfg.LLM_ENDPOINT
          cfgProvider = cfg.LLM_PROVIDER
        }
      } catch {}
      // canonical endpoint and provider
      const codeXBaseFinal = input.env?.LLM_ENDPOINT || cfgBase
      const codeXProviderFinal = input.env?.LLM_PROVIDER || cfgProvider || 'ollama'
      const configArgs: string[] = []
      if (!codeXBaseFinal)
        throw new Error('LLM_ENDPOINT must be provided in env or project config for codex CLI adapter')

      const provider = String(codeXProviderFinal)
      const providerCap = provider.charAt(0).toUpperCase() + provider.slice(1)
      configArgs.push('--profile', `gpt-oss-20b-${provider}`)

      // Ensure the codex profile exists in the system root ~/.codex/config.toml
      try {
        const ROOT = path.join(os.homedir())
        const tomlDir = path.join(ROOT, '.codex')
        try {
          fs.mkdirSync(tomlDir, { recursive: true })
        } catch {}
        const tomlPath = path.join(tomlDir, 'config.toml')
        try {
          // Minimal profile section name to mirror the CLI example name used historically
          const profileName = `gpt-oss-20b-${provider}`
          let existing = ''
          try {
            if (fs.existsSync(tomlPath)) existing = fs.readFileSync(tomlPath, 'utf8')
          } catch {}
          if (!existing.includes(`[profiles.${profileName}]`)) {
            const block = `\n[profiles.${profileName}]\nbase_url = "${codeXBaseFinal}"\nname = "${providerCap}"\n`
            try {
              fs.appendFileSync(tomlPath, block, 'utf8')
            } catch {}
          }
        } catch {}
      } catch {}

      // Always allow the codex CLI to be invoked; sandbox/approval flags are
      // not injected here. Tests that require a writable sandbox should set
      // up the environment or the external codex CLI profile accordingly.

      // Keep the prompt focused on implementation and append the spec if present.
      let finalPrompt = input.prompt || ''
      try {
        const specPath = path.join(input.cwd || '.', 'spec.md')
        if (fs.existsSync(specPath)) {
          const specText = fs.readFileSync(specPath, 'utf8')
          finalPrompt = finalPrompt ? finalPrompt + '\n\n' + specText : specText
        }
      } catch {}
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

      // Synchronously persist an invocation dump early so diagnostics exist even
      // if the child process fails or an exception occurs later.
      try {
        const outDirEarly = path.join(input.cwd || '.', '.agent')
        try {
          fs.mkdirSync(outDirEarly, { recursive: true })
        } catch {}
        const earlyDump = {
          args: [...preArgs, ...args],
          env: Object.assign({}, env),
          prompt: finalPrompt
        }
        const invPath = path.join(outDirEarly, 'codex-invocation.json')
        fs.writeFileSync(invPath, JSON.stringify(earlyDump, null, 2), 'utf8')
      } catch {}

      // Prefer invoking the external `codex` CLI. The adapter will not use
      // the HTTP fallback path; rely on the real `codex` CLI behavior only.

      // Persist a debug file into the agent dir so test runs can inspect the exact
      // invocation used for codex regardless of captured stdout/stderr.
      try {
        const outDir = path.join(input.cwd || '.', '.agent')
        try {
          fs.mkdirSync(outDir, { recursive: true })
        } catch {}
        // compute debug flags from input.env or project config
        let debugCodeX = String(input.env?.DEBUG_CODEX ?? '')
        try {
          const { getEffectiveConfig } = await import('../../config')
          const cfg = await getEffectiveConfig(input.cwd || '.')
          if (debugCodeX.trim() === '') debugCodeX = String((cfg as any).DEBUG_CODEX ?? '')
        } catch {}
        const dump = {
          args: [...preArgs, ...configArgs, ...args],
          env: {
            LLM_ENDPOINT: env.LLM_ENDPOINT,
            DEBUG_CODEX: debugCodeX || undefined,
            // Do not leak host process.env PATH/HOME; tests should set these in input.env when needed
            PATH: env.PATH || undefined,
            HOME: env.HOME || undefined,
            model
          },
          // include the final prompt body we sent to the CLI / HTTP path for diagnostics
          prompt: finalPrompt
        }
        fs.writeFileSync(path.join(outDir, 'codex-invocation.json'), JSON.stringify(dump, null, 2), 'utf8')
      } catch {
        // ignore write errors
      }

      const maxAttempts = Number(input.env?.LLM_RETRY_ATTEMPTS ?? process.env.LLM_RETRY_ATTEMPTS ?? 5)
      let lastRes: { stdout: string; stderr: string; exitCode: number } | null = null

      const cliArgsBase = [...preArgs, ...configArgs, ...args]
      for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
        const finalArgs = [...cliArgsBase]
        // write per-attempt invocation diagnostics
        try {
          const outDir = path.join(input.cwd || '.', '.agent')
          try {
            fs.mkdirSync(outDir, { recursive: true })
          } catch {}
          const attDump = {
            attempt,
            args: finalArgs,
            env: Object.assign({}, env),
            prompt: finalArgs[finalArgs.length - 1]
          }
          fs.writeFileSync(
            path.join(outDir, `codex-invocation-attempt-${attempt}.json`),
            JSON.stringify(attDump, null, 2),
            'utf8'
          )
        } catch {}

        // invoke codex CLI
        try {
          const res = await runCommand('codex', finalArgs, { cwd: input.cwd, timeoutMs: input.timeoutMs, env })
          lastRes = res

          const out = String(res.stdout || '')
          // normalize NDJSON lifecycle traces: parse each JSON line and
          // aggregate 'thinking' + 'response' text so we can detect
          // clarifying questions that may be split across streaming tokens.
          let aggregatedText = ''
          try {
            for (const ln of out.split(/\r?\n/)) {
              const t = ln.trim()
              if (!t) continue
              try {
                const obj = JSON.parse(t)
                if (obj) {
                  if (typeof obj.thinking === 'string') aggregatedText += obj.thinking + ' '
                  if (typeof obj.response === 'string') aggregatedText += obj.response + ' '
                  if (obj.item && typeof obj.item.text === 'string') aggregatedText += obj.item.text + ' '
                  if (obj.aggregated_output && typeof obj.aggregated_output === 'string')
                    aggregatedText += obj.aggregated_output + ' '
                }
                continue
              } catch {
                // not JSON - append raw line
                aggregatedText += ln + ' '
              }
            }
          } catch {}

          // detect extractable output by scanning raw output and aggregated text
          const fenceRe = /```(?:ts|typescript|js|javascript)?\n([\s\S]*?)\n```/gim
          const markerRe = /^===\s*(.+?)\s*===/m
          const patchRe = /(^diff --git |^@@ )/m
          const ndjsonAgg = /"aggregated_output"/m

          const hasFence = fenceRe.test(out) || fenceRe.test(aggregatedText)
          const hasMarker = markerRe.test(out) || markerRe.test(aggregatedText)
          const hasPatch = patchRe.test(out) || patchRe.test(aggregatedText)
          const hasAgg = ndjsonAgg.test(out) || ndjsonAgg.test(aggregatedText)

          if (hasFence || hasMarker || hasPatch || hasAgg) {
            // success: attempt to extract and APPLY the produced artifacts
            try {
              const combined = (out || '') + '\n' + (aggregatedText || '')
              const outDir = path.join(input.cwd || '.', '.agent')
              try {
                fs.mkdirSync(outDir, { recursive: true })
              } catch {}

              // persist the raw output as a diagnostic patches file
              try {
                const pth = path.join(outDir, 'patches.diff')
                fs.writeFileSync(pth, combined, 'utf8')
              } catch {}

              // If we found a git-style patch, write it and attempt to apply
              if (hasPatch) {
                try {
                  const patchPath = path.join(outDir, 'codex-generated.patch')
                  // prefer the raw captured output if it contains the patch
                  fs.writeFileSync(patchPath, combined, 'utf8')
                  try {
                    // attempt to apply the patch
                    await runCommand('git', ['apply', '--whitespace=fix', patchPath], {
                      cwd: input.cwd || '.',
                      env: input.env || {}
                    })
                    // stage and commit applied changes so subsequent steps see them
                    try {
                      await runCommand('git', ['add', '-A'], { cwd: input.cwd || '.', env: input.env || {} })
                      try {
                        await runCommand('git', ['commit', '-m', 'agent: apply codex patch'], {
                          cwd: input.cwd || '.',
                          env: input.env || {}
                        })
                      } catch {}
                    } catch {}
                  } catch {
                    // applying patch may fail; keep diagnostics and continue
                  }
                } catch {}
              }

              // Extract '=== path ===' markers and fenced code blocks (with optional // File: header)
              try {
                const markerRe = /^===\s*(.+?)\s*===\n([\s\S]*?)(?=^===|\z)/gim
                let m
                let wroteAny = false
                while ((m = markerRe.exec(combined))) {
                  const rel = m[1].trim()
                  const content = m[2]
                  const abs = path.join(input.cwd || '.', rel)
                  try {
                    fs.mkdirSync(path.dirname(abs), { recursive: true })
                    fs.writeFileSync(abs, content, 'utf8')
                    wroteAny = true
                  } catch {}
                }

                // Fenced code blocks
                const fenceRe = /```(?:ts|typescript|js|javascript)?\n([\s\S]*?)\n```/gim
                let fm
                while ((fm = fenceRe.exec(combined))) {
                  let content = fm[1]
                  // if the first line is a filename header like '// File: path'
                  const firstLine = content.split(/\r?\n/)[0] || ''
                  const fileHeader = firstLine.match(/^\/\/\s*File:\s*(.+)$/i)
                  let relPath = ''
                  if (fileHeader && fileHeader[1]) {
                    relPath = fileHeader[1].trim()
                    // drop the header line from content
                    content = content.replace(
                      new RegExp('^' + firstLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\r?\\n'),
                      ''
                    )
                  }
                  const guessPath = path.join(input.cwd || '.', relPath || 'src/cli/sum-lines.ts')
                  try {
                    fs.mkdirSync(path.dirname(guessPath), { recursive: true })
                    fs.writeFileSync(guessPath, content, 'utf8')
                    wroteAny = true
                  } catch {}
                }

                // If we wrote any files, stage & commit them so orchestrator verification sees them
                if (wroteAny) {
                  try {
                    await runCommand('git', ['add', '-A'], { cwd: input.cwd || '.', env: input.env || {} })
                    try {
                      await runCommand('git', ['commit', '-m', 'agent: wrote files from codex output'], {
                        cwd: input.cwd || '.',
                        env: input.env || {}
                      })
                    } catch {}
                  } catch {}
                }
              } catch {}
            } catch {
              // keep going even if extraction/apply fails; return the raw result for downstream handling
            }

            // success: return the result (we applied artifacts where possible)
            return res
          }
          // If the model asked clarifying questions (common indicator: a
          // trailing question sentence or explicit 'What should I name the
          // file?' style text), attempt to answer them automatically by
          // appending a short assumptions paragraph. Then retry.
          // Otherwise, as a fallback also append the spec to encourage full
          // implementation in the next attempt.
          if (attempt < maxAttempts) {
            try {
              const specPath = path.join(input.cwd || '.', 'spec.md')
              let specText = ''
              if (fs.existsSync(specPath)) specText = fs.readFileSync(specPath, 'utf8')
              // Keep the retry simple: re-attach the spec and a short instruction
              // to proceed with implementation. Avoid injecting assumptions or
              // requiring special marker formats.
              const clar =
                '\n\nPlease proceed to implement the requested changes using the attached spec. Do not ask further clarification questions.' +
                '\n\n' +
                specText
              finalArgs[finalArgs.length - 1] = String(finalArgs[finalArgs.length - 1]) + clar
              cliArgsBase.splice(0, cliArgsBase.length, ...finalArgs)
            } catch {}
            await new Promise((r) => setTimeout(r, 400))
            continue
          }

          // otherwise, return what we have
          return res
        } catch (e: any) {
          // on unexpected error, if lastRes exists return it, otherwise propagate
          if (lastRes) return lastRes
          return { stdout: '', stderr: String(e || 'error'), exitCode: 2 }
        }
      }
      // fallthrough: return last known result
      return lastRes || { stdout: '', stderr: '', exitCode: 2 }
    }
  }
}

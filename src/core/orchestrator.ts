import { promises as fs } from 'fs'
import path from 'path'
import { getAgentAdapter } from '../adapters/agent/index'
import { getLLMAdapter } from '../adapters/llm/index'
import { getEffectiveConfig } from '../config'
import { ensureDir, readJsonSafe, writeFileAtomic, writeJsonAtomic } from '../io/fs'
import type { StateJsonV1, WhatDone } from '../types/models'
import { runVerification } from '../validation/verify'
import { routeWhatDone, whatDoneFromText } from './evaluation'
import { withLock } from './locks'
import { applyProgressPatch } from './progress'
import { genChecklist, genNext, genResponseType } from './templates'

export async function getState(cwd: string): Promise<StateJsonV1> {
  const p = path.join(cwd, '.agent', 'state.json')
  return readJsonSafe<StateJsonV1>(p, {
    version: 1,
    currentRunId: null,
    status: 'idle',
    lastOutcome: 'none',
    nextTask: null
  } as StateJsonV1)
}

export async function setState(cwd: string, patch: Partial<StateJsonV1>): Promise<StateJsonV1> {
  const current = await getState(cwd)
  const next = { ...current, ...patch } as StateJsonV1
  const p = path.join(cwd, '.agent', 'state.json')
  await ensureDir(path.dirname(p))
  await writeJsonAtomic(p, next)
  return next
}

export function newRunId(): string {
  return 'run-' + new Date().toISOString().replace(/[:]/g, '-')
}

export async function recordRun(cwd: string, runId: string, data: any): Promise<void> {
  const p = path.join(cwd, '.agent', 'runs', runId, 'run.json')
  await ensureDir(path.dirname(p))
  await writeJsonAtomic(p, data)
}

export async function routeOutcome(cwd: string, whatDone: WhatDone) {
  const status = routeWhatDone(whatDone)
  await setState(cwd, { status, lastOutcome: whatDone })
}

export async function runOnce(
  cwd: string,
  opts: {
    llm: string
    endpoint?: string
    model?: string
    agent: string
    prompt?: string
    force?: boolean
    nonInteractive?: boolean
  }
) {
  return withLock(cwd, async () => {
    // Respect human approval gating: if the orchestrator state is awaiting_approval
    // a run should not proceed unless explicitly forced.
    const current = await getState(cwd)
    if (current.status === 'awaiting_approval' && !opts.force) {
      if (opts.nonInteractive) {
        throw new Error('Cannot run in non-interactive mode: awaiting human approval. Re-run with --force to override.')
      }
      // default behavior: block and require explicit --force to proceed
      throw new Error('Cannot run: awaiting human approval. Re-run with --force to override.')
    }

    const runId = newRunId()
    await setState(cwd, { currentRunId: runId, status: 'running' } as any)
    const startedAt = new Date().toISOString()

    // Load effective config (project overrides environment). This will seed
    // the project config if missing via the underlying helper.
    const cfg = await getEffectiveConfig(cwd)

    const llmName = opts.llm || cfg.LLM_PROVIDER || 'ollama'
    const model = opts.model || cfg.LLM_MODEL
    const endpoint = opts.endpoint || cfg.LLM_ENDPOINT

    const llm = getLLMAdapter(llmName, {
      endpoint,
      model
    })

    const agentName = opts.agent || cfg.AGENT || 'codex-cli'
    const agent = getAgentAdapter(agentName)

    // Build structured inputs for the run
    let specText = ''
    try {
      specText = await fs.readFile(path.join(cwd, 'spec.md'), 'utf8')
    } catch {}

    const checklist = genChecklist(specText)
    const { genContextAsync } = await import('./templates')
    const contextPrompt = await genContextAsync(specText)
    const responseType = await genResponseType()

    // if a reviewer previously requested changes, include the Recommendations
    // (stored as nextTask in state) as part of the context prompts
    const state = current
    const extraContext: string[] = []
    if (state.nextTask) {
      const nt = state.nextTask as any
      extraContext.push(`Recommendations:\n${nt.title}\n${nt.summary}`)
    }

    const initialAgentPrompt = opts.prompt ?? 'Implement the spec.'
    // assemble LLM prompt with context and checklist
    const llmPrompt = [
      'Context:\n' + [contextPrompt, ...extraContext].filter(Boolean).join('\n\n'),
      'Checklist:\n' + checklist.map((c) => `- ${c}`).join('\n'),
      'ResponseType: ' + responseType,
      'Instructions:\n' + initialAgentPrompt
    ].join('\n\n')

    // If an explicit prompt was provided to runOnce (tests and CLI helpers
    // use this), prefer that prompt and skip the LLM step. Otherwise call
    // the LLM to generate the agent prompt from context.
    let agentRes: any
    if (opts.prompt) {
      agentRes = await agent.run({ prompt: initialAgentPrompt, cwd })
    } else {
      const llmOut = await llm.generate({
        prompt: llmPrompt,
        temperature: 0
      })
      agentRes = await agent.run({
        prompt: llmOut.text || initialAgentPrompt,
        cwd
      })
    }
    // interpret agent outputs according to responseType
    let patchesFiles: string[] = []
    const filesWritten: string[] = []
    const commandsRun: string[] = []
    if (responseType === 'patches' || responseType === 'mixed') {
      try {
        const relPatch = path.join('.agent', 'runs', runId, 'patches.diff')
        const absPatch = path.join(cwd, relPatch)
        await writeFileAtomic(absPatch, agentRes.stdout || '')
        patchesFiles.push(relPatch)
      } catch {
        // ignore write failures; record nothing
      }
    }

    if (responseType === 'files' || responseType === 'mixed') {
      // simple file format: lines starting with "=== filename ===" denote file boundaries
      const out = agentRes.stdout || ''
      const fileSep = /^===\s*(.+?)\s*===$/gm
      // Collect all markers first to avoid issues with regex lastIndex advancing
      const matches = Array.from(out.matchAll(fileSep)) as RegExpMatchArray[]
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i] as RegExpMatchArray
        const filename = (match[1] || '').trim()
        const start = (match.index || 0) + match[0].length
        const end = i + 1 < matches.length ? matches[i + 1].index || out.length : out.length
        const body = out.slice(start, end).trim()
        try {
          const abs = path.join(cwd, filename)
          await writeFileAtomic(abs, body)
          filesWritten.push(filename)
        } catch {
          // ignore per-file failures
        }
      }
      // if no markers present and the stdout looks like a single file, skip
    }

    if (responseType === 'commands' || responseType === 'mixed') {
      const out = (agentRes.stdout || '').trim()
      if (out) {
        // Guard: only execute commands when explicitly enabled via project config
        try {
          // We already loaded the effective config above into `cfg` and use that
          // to decide whether command execution is allowed. The dynamic import is
          // retained for safety in case this block runs in isolation.
          const { getEffectiveConfig: _get } = await import('../config')
          const localCfg = await _get(cwd)
          if (localCfg && (localCfg as any).ALLOW_COMMANDS) {
            const { exec } = await import('child_process')
            // NOTE: for safety we run commands synchronously and capture output
            await new Promise<void>((resolve, reject) => {
              // cast options to any to satisfy TS for shell:true
              exec(out, { cwd: cwd as any, shell: true as any }, (err: any) => {
                if (err) return reject(err)
                commandsRun.push(out)
                resolve()
              })
            })
          }
        } catch {
          // failed to run commands or commands not allowed; don't throw from orchestrator
        }
      }
    }

    const what = whatDoneFromText(agentRes.stdout + '\n' + agentRes.stderr)
    // Run verification. Prefer the already-loaded projectCfg to decide
    // whether verification should be skipped (avoids any timing/visibility
    // issues reading the config again inside runVerification).
    let verification: any
    try {
      if (cfg && cfg.SKIP_VERIFY) {
        verification = {
          skipped: true,
          reason: 'SKIP_VERIFY=true in project config',
          lint: 'pass',
          typecheck: 'pass',
          tests: { passed: 0, failed: 0 }
        }
      } else if (process.env.SKIP_VERIFY === 'true' || process.env.SKIP_VERIFY === '1') {
        verification = {
          skipped: true,
          reason: 'SKIP_VERIFY=true in environment',
          lint: 'pass',
          typecheck: 'pass',
          tests: { passed: 0, failed: 0 }
        }
      } else {
        verification = await runVerification(cwd)
      }
    } catch {
      verification = await runVerification(cwd)
    }

    const endedAt = new Date().toISOString()
    // capture git diffs (name-only and truncated full diff)
    let diffFiles: string[] = []
    let diffFull = ''
    try {
      const { gitDiffNameOnly, gitDiffFull } = await import('../io/git')
      diffFiles = await gitDiffNameOnly({ cwd })
      diffFull = await gitDiffFull({ cwd, maxChars: 20000 })
    } catch {}

    // Enforce acceptance criteria: if spec implemented but verification failed
    // or acceptance criteria are not satisfied, mark as failed/changes_requested
    let finalWhat = what
    if (what === 'spec_implemented') {
      const v = verification || { lint: 'pass', typecheck: 'pass', tests: { passed: 0, failed: 0, coverage: 0 } }
      let acceptanceOk = true
      try {
        const { readNextTaskAcceptanceCriteria } = await import('./progress')
        const criteria = await readNextTaskAcceptanceCriteria(cwd)
        // If acceptance criteria exist, we require tests to have passed
        if (criteria && criteria.length > 0) {
          if (!v.tests || (v.tests && v.tests.failed && v.tests.failed > 0)) acceptanceOk = false
        }
      } catch {
        // ignore read failures and fall back to verification-only
      }

      if (
        v.lint !== 'pass' ||
        v.typecheck !== 'pass' ||
        (v.tests && v.tests.failed && v.tests.failed > 0) ||
        !acceptanceOk
      ) {
        finalWhat = 'failed'
      }
    }

    const runJson = {
      runId,
      startedAt,
      agent: { name: agent.name, version: '0' },
      llm: {
        provider: opts.llm,
        model: opts.model ?? 'gpt-oss:20b',
        params: { temperature: 0 }
      },
      inputs: {
        initialAgentPrompt,
        contextPrompts: [contextPrompt, ...extraContext],
        checklist,
        responseType,
        llmPrompt
      },
      outputs: {
        patches: patchesFiles,
        stdout: agentRes.stdout,
        stderr: agentRes.stderr,
        artifacts: []
      },
      whatDone: finalWhat,
      verification,
      git: { files: diffFiles, diff: diffFull },
      review: {
        required: what === 'spec_implemented',
        status: 'pending',
        notes: ''
      },
      endedAt,
      durationMs: new Date(endedAt).getTime() - new Date(startedAt).getTime()
    }
    await recordRun(cwd, runId, runJson)
    // If the agent indicates clarifications are needed, generate clarifying
    // questions and write them into progress.md, then set orchestrator state.
    if (finalWhat === 'needs_clarification') {
      try {
        const { genClarifyAsync } = await import('./templates')
        const clar = await genClarifyAsync(specText)
        await applyProgressPatch(cwd, { clarifications: clar })
      } catch {
        // ignore failures writing clarifications
      }
    }
    await routeOutcome(cwd, finalWhat)
    // Apply structured progress patch
    const { genUpdate } = await import('./templates')
    const upd = genUpdate({ whatDone: finalWhat, verification })
    await applyProgressPatch(cwd, upd.progressPatch)
    // audit
    const auditLine =
      JSON.stringify({
        ts: new Date().toISOString(),
        runId,
        what,
        status: routeWhatDone(what)
      }) + '\n'
    await fs.appendFile(path.join(cwd, '.agent', 'audit.log'), auditLine, 'utf8')
    // nextTask heuristic
    if (finalWhat === 'completed_task') {
      const next = genNext()
      await setState(cwd, { nextTask: next } as any)
    }
    return runJson
  })
}

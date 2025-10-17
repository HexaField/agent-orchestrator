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
import { genNext, genResponseType } from './templates'

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
    // approval gating
    const current = await getState(cwd)
    if (current.status === 'awaiting_approval' && !opts.force) {
      if (opts.nonInteractive)
        throw new Error('Cannot run in non-interactive mode: awaiting human approval. Re-run with --force to override.')
      throw new Error('Cannot run: awaiting human approval. Re-run with --force to override.')
    }

    const runId = newRunId()
    await setState(cwd, { currentRunId: runId, status: 'running' } as any)
    const startedAt = new Date().toISOString()

    const cfg = await getEffectiveConfig(cwd)
    const llmName = opts.llm || cfg.LLM_PROVIDER || 'ollama'
    const model = opts.model || cfg.LLM_MODEL
    const endpoint = opts.endpoint || cfg.LLM_ENDPOINT

    const llm = getLLMAdapter(llmName, { endpoint, model })
    const agentName = opts.agent || cfg.AGENT || 'codex-cli'
    const agent = getAgentAdapter(agentName)

    let specText = ''
    try {
      specText = await fs.readFile(path.join(cwd, 'spec.md'), 'utf8')
    } catch {}

    const { readProgressJson } = await import('./progress')
    const parsedProgress = await readProgressJson(cwd)
    if (!parsedProgress || !Array.isArray((parsedProgress as any).checklist)) {
      throw new Error(
        'Missing checklist in progress.json — run `agent-orchestrator spec-to-progress` to generate it before running the agent.'
      )
    }

    const checklist = (parsedProgress.checklist || [])
      .map((i: any) => (typeof i === 'string' ? i : i.description || ''))
      .filter(Boolean)
    const { genContextAsync, genClarifyAsync, genUpdate } = await import('./templates')
    const contextPrompt = await genContextAsync(specText, cwd)
    const responseType = await genResponseType()

    const extraContext: string[] = []
    if (current.nextTask) {
      const nt = current.nextTask as any
      extraContext.push(`Recommendations:\n${nt.title}\n${nt.summary}`)
    }

    const initialAgentPrompt = opts.prompt ?? 'Implement the spec.'
    const llmPrompt = [
      'Context:\n' + [contextPrompt, ...extraContext].filter(Boolean).join('\n\n'),
      'Checklist:\n' + checklist.map((c) => `- ${c}`).join('\n'),
      'ResponseType: ' + responseType,
      'Instructions:\n' + initialAgentPrompt
    ].join('\n\n')

    let agentRes: any
    const isSessionAgent = (agent as any).startSession && (agent as any).send && (agent as any).closeSession
    if (isSessionAgent) {
      // session-based flow
      const sessAgent = agent as any
      const session = await sessAgent.startSession({ cwd, env: process.env })
      try {
        const promptToSend = opts.prompt
          ? initialAgentPrompt
          : (await llm.generate({ prompt: llmPrompt, temperature: 0 })).text || initialAgentPrompt
        // collect response by consuming the async iterable until it completes or times out
        let stdout = ''
        try {
          for await (const ev of sessAgent.send(session, promptToSend)) {
            try {
              stdout += typeof ev === 'string' ? ev : JSON.stringify(ev) + '\n'
            } catch {}
          }
        } catch {}
        agentRes = { stdout, stderr: '', exitCode: 0 }
      } finally {
        try {
          await sessAgent.closeSession(session)
        } catch {}
      }
    } else {
      if (opts.prompt) {
        agentRes = await agent.run({ prompt: initialAgentPrompt, cwd })
      } else {
        const llmOut = await llm.generate({ prompt: llmPrompt, temperature: 0 })
        agentRes = await agent.run({ prompt: llmOut.text || initialAgentPrompt, cwd })
      }
    }

    const patchesFiles: string[] = []
    const filesWritten: string[] = []
    const commandsRun: string[] = []

    if (responseType === 'patches' || responseType === 'mixed') {
      try {
        const relPatch = path.join('.agent', 'runs', runId, 'patches.diff')
        await writeFileAtomic(path.join(cwd, relPatch), agentRes.stdout || '')
        patchesFiles.push(relPatch)
      } catch {
        // ignore
      }
    }

    if (responseType === 'files' || responseType === 'mixed') {
      const out = agentRes.stdout || ''
      const fileSep = /^===\s*(.+?)\s*===$/gm
      const matches = Array.from(out.matchAll(fileSep)) as RegExpMatchArray[]
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i]
        const filename = (match[1] || '').trim()
        const start = (match.index || 0) + match[0].length
        const end = i + 1 < matches.length ? matches[i + 1].index || out.length : out.length
        const body = out.slice(start, end).trim()
        try {
          await writeFileAtomic(path.join(cwd, filename), body)
          filesWritten.push(filename)
        } catch {
          // ignore per-file failures
        }
      }
    }

    if (responseType === 'commands' || responseType === 'mixed') {
      const out = (agentRes.stdout || '').trim()
      if (out) {
        try {
          const { exec } = await import('child_process')
          await new Promise<void>((resolve, reject) => {
            exec(out, { cwd: cwd as any, shell: true as any }, (err: any) => {
              if (err) return reject(err)
              commandsRun.push(out)
              resolve()
            })
          })
        } catch {
          // ignore
        }
      }
    }

    const maxAttempts = Number(process.env.AUTO_CLARIFY_ATTEMPTS || '2') || 2
    let attempt = 0
    while (attempt < maxAttempts) {
      const currentWhat = whatDoneFromText((agentRes.stdout || '') + '\n' + (agentRes.stderr || ''))
      if (currentWhat !== 'needs_clarification') break
      try {
        const clar = await genClarifyAsync(specText, cwd)
        const assumptions = [
          'Place implementation files under src/, e.g. src/cli/ for CLIs.',
          'Place unit tests under tests/unit/ following existing repo conventions.',
          'If a CLI entrypoint is required, add a simple npm script in package.json to run it.',
          'If filenames are unspecified, choose reasonable, idiomatic paths that match the spec.'
        ].join(' ')

        const autoPrompt =
          initialAgentPrompt +
          '\n\nClarifications (automated):\n' +
          clar +
          '\n\nAutomated assumptions: ' +
          assumptions +
          '\n\nAnswer the clarifications briefly and then implement the spec. If any details are ambiguous, prefer the automated assumptions above and proceed. Do NOT ask further clarification questions. Emit your changes as either a unified git diff, fenced code blocks (```), or a single NDJSON line with { "aggregated_output": ... } so the orchestrator can extract files.'
        const newRes = await agent.run({ prompt: autoPrompt, cwd })
        agentRes.stdout =
          (agentRes.stdout || '') + '\n\n--- AUTO-CLARIFY ATTEMPT ' + (attempt + 1) + ' ---\n' + (newRes.stdout || '')
        agentRes.stderr = (agentRes.stderr || '') + '\n\n' + (newRes.stderr || '')
      } catch {
        break
      }
      attempt++
    }

    const what = whatDoneFromText(agentRes.stdout + '\n' + agentRes.stderr)
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
    let diffFiles: string[] = []
    let diffFull = ''
    try {
      const { gitDiffNameOnly, gitDiffFull } = await import('../io/git')
      diffFiles = await gitDiffNameOnly({ cwd })
      diffFull = await gitDiffFull({ cwd, maxChars: 20000 })
    } catch {}

    let finalWhat = what
    if (what === 'spec_implemented') {
      const v = verification || { lint: 'pass', typecheck: 'pass', tests: { passed: 0, failed: 0, coverage: 0 } }
      let acceptanceOk = true
      try {
        const { readNextTaskAcceptanceCriteria } = await import('./progress')
        const criteria = await readNextTaskAcceptanceCriteria(cwd)
        if (criteria && criteria.length > 0) {
          if (!v.tests || (v.tests && v.tests.failed && v.tests.failed > 0)) acceptanceOk = false
        }
      } catch {
        // ignore
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
      llm: { provider: opts.llm, model: opts.model ?? 'gpt-oss:20b', params: { temperature: 0 } },
      inputs: {
        initialAgentPrompt,
        contextPrompts: [contextPrompt, ...extraContext],
        checklist,
        responseType,
        llmPrompt
      },
      outputs: { patches: patchesFiles, stdout: agentRes.stdout, stderr: agentRes.stderr, artifacts: [] },
      whatDone: finalWhat,
      verification,
      git: { files: diffFiles, diff: diffFull },
      review: { required: what === 'spec_implemented', status: 'pending', notes: '' },
      endedAt,
      durationMs: new Date(endedAt).getTime() - new Date(startedAt).getTime()
    }
    await recordRun(cwd, runId, runJson)

    if (finalWhat === 'needs_clarification') {
      try {
        const clar = await genClarifyAsync(specText, cwd)
        await applyProgressPatch(cwd, { clarifications: clar })
      } catch {
        // ignore
      }
    }

    await routeOutcome(cwd, finalWhat)
    const upd = genUpdate({ whatDone: finalWhat, verification })
    await applyProgressPatch(cwd, upd.progressPatch)

    const auditLine = JSON.stringify({ ts: new Date().toISOString(), runId, what, status: routeWhatDone(what) }) + '\n'
    await fs.appendFile(path.join(cwd, '.agent', 'audit.log'), auditLine, 'utf8')

    if (finalWhat === 'completed_task') {
      const next = genNext()
      await setState(cwd, { nextTask: next } as any)
    }

    return runJson
  })
}

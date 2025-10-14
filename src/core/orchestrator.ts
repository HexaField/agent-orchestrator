import { promises as fs } from 'fs'
import path from 'path'
import { getAgentAdapter } from '../adapters/agent/index'
import { getLLMAdapter } from '../adapters/llm/index'
import { ensureDir, readJsonSafe, writeJsonAtomic } from '../io/fs'
import type { StateJsonV1, WhatDone } from '../types/models'
import { runVerification } from '../validation/verify'
import { routeWhatDone, whatDoneFromText } from './evaluation'
import { withLock } from './locks'
import { applyProgressPatch } from './progress'
import { genNext, genContext, genChecklist, genResponseType } from './templates'

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

    const llm = getLLMAdapter(opts.llm, {
      endpoint: opts.endpoint,
      model: opts.model
    })
    const agent = getAgentAdapter(opts.agent)

    // Build structured inputs for the run
    let specText = ''
    try {
      specText = await fs.readFile(path.join(cwd, 'spec.md'), 'utf8')
    } catch {}

    const checklist = genChecklist(specText)
    const contextPrompt = genContext()
    const responseType = genResponseType()

    const initialAgentPrompt = opts.prompt ?? 'Implement the spec.'
    // assemble LLM prompt with context and checklist
    const llmPrompt = [
      'Context:\n' + contextPrompt,
      'Checklist:\n' + checklist.map((c) => `- ${c}`).join('\n'),
      'ResponseType: ' + responseType,
      'Instructions:\n' + initialAgentPrompt
    ].join('\n\n')

    const llmOut = await llm.generate({
      prompt: llmPrompt,
      temperature: 0
    })
    const agentRes = await agent.run({
      prompt: llmOut.text || initialAgentPrompt,
      cwd
    })

    const what = whatDoneFromText(agentRes.stdout + '\n' + agentRes.stderr)
    const verification = await runVerification()

    const endedAt = new Date().toISOString()
    // capture git diffs (name-only and truncated full diff)
    let diffFiles: string[] = []
    let diffFull = ''
    try {
      const { gitDiffNameOnly, gitDiffFull } = await import('../io/git')
      diffFiles = await gitDiffNameOnly({ cwd })
      diffFull = await gitDiffFull({ cwd, maxChars: 20000 })
    } catch {}

    // if spec implemented but verification failed, mark as failed/changes_requested
    let finalWhat = what
    if (what === 'spec_implemented') {
      const v = verification || { lint: 'pass', typecheck: 'pass', tests: { passed: 0, failed: 0, coverage: 0 } }
      if (v.lint !== 'pass' || v.typecheck !== 'pass' || (v.tests && v.tests.failed && v.tests.failed > 0)) {
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
      inputs: { initialAgentPrompt, contextPrompts: [contextPrompt], checklist, responseType, llmPrompt },
      outputs: {
        patches: [],
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
        const clar = (await import('./templates')).genClarify()
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

import fs from 'fs'
import path from 'path'
import { AgentAdapter } from '../adapters/agent/interface'
import { LLMAdapter } from '../adapters/llm/interface'
import analyzeIteration from './feedback'

export type TaskLoopOpts = {
  task: string
  agent: AgentAdapter
  llm: LLMAdapter
  workDir: string
  maxIterations?: number
  /**
   * Optional path to an existing run directory. If provided, the task loop will
   * write provenance and artifacts into this directory instead of creating a
   * new run folder. When provided, the TaskLoop will return runId equal to
   * the basename of this directory.
   */
  runDir?: string
}

export type TaskLoopStep = {
  id: string
  iteration: number
  adapter: 'agent' | 'llm' | 'feedback'
  input: any
  output: any
}

export type TaskLoopResult = {
  runId: string
  steps: TaskLoopStep[]
  summary: { success: boolean; reason?: string }
  artifactsPath: string
}

function mkRunDir(base: string): string {
  const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  const p = path.join(base, 'run', id)
  fs.mkdirSync(p, { recursive: true })
  return p
}

/**
 * A simple TaskLoop implementation that iterates between the agent and an LLM
 * to determine whether a given task (string) has been completed.
 *
 * Loop behaviour (simple):
 *  - start an agent session
 *  - ask the agent to perform the task (pass the task string)
 *  - ask the LLM whether the agent's response indicates completion (yes/no)
 *  - repeat until LLM says 'yes' or maxIterations reached
 */
export async function runTaskLoop(opts: TaskLoopOpts): Promise<TaskLoopResult> {
  const { task, agent, llm, workDir, maxIterations = 6 } = opts

  const artifactsBase = path.join(workDir, '.agent')
  const runDir = opts.runDir ? opts.runDir : mkRunDir(artifactsBase)
  const provenanceDir = path.join(runDir, 'provenance')
  fs.mkdirSync(provenanceDir, { recursive: true })
  const steps: TaskLoopStep[] = []
  const runId = path.basename(runDir)

  function sanitizeOutput(o: any) {
    if (o == null) return o
    try {
      const copy = JSON.parse(JSON.stringify(o))
      const forbidden = /(token|secret|key|password|private)/i
      const scrub = (x: any) => {
        if (x && typeof x === 'object') {
          for (const k of Object.keys(x)) {
            try {
              if (forbidden.test(k)) x[k] = '[REDACTED]'
              else scrub(x[k])
            } catch (e) {
              // ignore
            }
          }
        }
      }
      scrub(copy)
      return copy
    } catch (e) {
      return { text: String(o) }
    }
  }

  let sessionId: string | undefined
  try {
    // start session
    sessionId = await agent.startSession({})
    steps.push({ id: `s-1`, iteration: 0, adapter: 'agent', input: { action: 'startSession' }, output: { sessionId } })

    // write provenance for session start
    const sessionProv = {
      id: `s-1`,
      timestamp: new Date().toISOString(),
      adapter: 'agent',
      type: 'session',
      input: { action: 'startSession' },
      output: { sessionId }
    }
    fs.writeFileSync(path.join(provenanceDir, `000-session.json`), JSON.stringify(sessionProv, null, 2), 'utf8')

    let lastAgentOutput = ''
    for (let i = 1; i <= maxIterations; i++) {
      // Ask the agent to perform the task. Provide context of previous output.
      const agentInput = `Task: ${task}\nIteration: ${i}\nPrevious output: ${lastAgentOutput}`
      const agentRes = await agent.run(sessionId, agentInput)
      lastAgentOutput = agentRes.text
      steps.push({ id: `a-${i}`, iteration: i, adapter: 'agent', input: agentInput, output: agentRes })

      // Analyze the iteration using the feedback engine (which performs the LLM call).
      const analysis = await analyzeIteration({ llm, runId, iteration: i, task, agentOutput: agentRes })
      const feedback = analysis.feedback
      const llmRes = analysis.llm
      const llmMessages = analysis.llmMessages

      // record LLM step if available
      if (llmRes) {
        steps.push({ id: `l-${i}`, iteration: i, adapter: 'llm', input: llmMessages, output: llmRes })
      }

      steps.push({ id: `f-${i}`, iteration: i, adapter: 'feedback', input: { agent: agentRes }, output: feedback })

      // persist feedback to provenance
      fs.writeFileSync(
        path.join(provenanceDir, `${i.toString().padStart(3, '0')}-feedback.json`),
        JSON.stringify(sanitizeOutput(feedback), null, 2),
        'utf8'
      )

      const normalized = (llmRes?.text || '').trim().toLowerCase()
      const isYes =
        (feedback && feedback.verdict === 'complete') ||
        normalized.startsWith('yes') ||
        normalized === 'y' ||
        normalized.includes('yes')

      // persist step file for inspection (legacy placement)
      const stepFile = path.join(runDir, `${i.toString().padStart(3, '0')}.json`)
      fs.writeFileSync(stepFile, JSON.stringify({ iteration: i, agent: agentRes, llm: llmRes }, null, 2), 'utf8')

      // create detailed provenance entry per spec
      const agentHasDiff = agentRes && (agentRes as any).diff
      const agentStdout = agentRes && (agentRes as any).stdout
      const agentStderr = agentRes && (agentRes as any).stderr

      const provAgent = {
        id: `a-${i}`,
        timestamp: new Date().toISOString(),
        adapter: 'agent',
        type: agentHasDiff ? 'diff' : 'exec',
        input: { prompt: agentInput },
        output: sanitizeOutput(agentRes),
        diff: agentHasDiff ? (agentRes as any).diff : null,
        stdout: typeof agentStdout === 'string' ? agentStdout : undefined,
        stderr: typeof agentStderr === 'string' ? agentStderr : undefined
      }
      fs.writeFileSync(
        path.join(provenanceDir, `${i.toString().padStart(3, '0')}-agent.json`),
        JSON.stringify(provAgent, null, 2),
        'utf8'
      )

      if (llmRes) {
        const provLLM = {
          id: `l-${i}`,
          timestamp: new Date().toISOString(),
          adapter: 'llm',
          type: 'llm-call',
          input: { messages: llmMessages },
          output: sanitizeOutput(llmRes),
          stdout: (llmRes as any).stdout,
          stderr: (llmRes as any).stderr
        }
        fs.writeFileSync(
          path.join(provenanceDir, `${i.toString().padStart(3, '0')}-llm.json`),
          JSON.stringify(provLLM, null, 2),
          'utf8'
        )
      }

      if (isYes) {
        // success
        return {
          runId,
          steps,
          summary: { success: true, reason: 'LLM judged completion' },
          artifactsPath: runDir
        }
      }
    }

    return { runId, steps, summary: { success: false, reason: 'Max iterations reached' }, artifactsPath: runDir }
  } finally {
    // best-effort stop
    try {
      if (typeof agent.stop === 'function') {
        await agent.stop()
      }
    } catch (err) {
      // ignore
    }
  }
}

export default runTaskLoop

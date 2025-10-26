import fs from 'fs'
import path from 'path'
import { AgentAdapter } from '../adapters/agent/interface'
import { LLMAdapter, Message } from '../adapters/llm/interface'

export type TaskLoopOpts = {
  task: string
  agent: AgentAdapter
  llm: LLMAdapter
  workDir: string
  maxIterations?: number
}

export type TaskLoopStep = {
  id: string
  iteration: number
  adapter: 'agent' | 'llm'
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
  const runDir = mkRunDir(artifactsBase)
  const steps: TaskLoopStep[] = []
  const runId = path.basename(runDir)

  let sessionId: string | undefined
  try {
    // start session
    sessionId = await agent.startSession({})
    steps.push({ id: `s-1`, iteration: 0, adapter: 'agent', input: { action: 'startSession' }, output: { sessionId } })

    let lastAgentOutput = ''
    for (let i = 1; i <= maxIterations; i++) {
      // Ask the agent to perform the task. Provide context of previous output.
      const agentInput = `Task: ${task}\nIteration: ${i}\nPrevious output: ${lastAgentOutput}`
      const agentRes = await agent.run(sessionId, agentInput)
      lastAgentOutput = agentRes.text
      steps.push({ id: `a-${i}`, iteration: i, adapter: 'agent', input: agentInput, output: agentRes })

      // Ask the LLM whether the agent output means the task is done.
      const llmMessages: Message[] = [
        { role: 'system', content: 'You are a concise judge. Answer only yes or no.' },
        {
          role: 'user',
          content: `Task: ${task}\nAgent output: ${lastAgentOutput}\nIs the task complete? Answer 'yes' or 'no'.`
        }
      ]

      const llmRes = await llm.call(llmMessages, { maxTokens: 16 })
      steps.push({ id: `l-${i}`, iteration: i, adapter: 'llm', input: llmMessages, output: llmRes })

      const normalized = (llmRes.text || '').trim().toLowerCase()
      const isYes = normalized.startsWith('yes') || normalized === 'y' || normalized.includes('yes')

      // persist step file for inspection
      const stepFile = path.join(runDir, `${i.toString().padStart(3, '0')}.json`)
      fs.writeFileSync(stepFile, JSON.stringify({ iteration: i, agent: agentRes, llm: llmRes }, null, 2), 'utf8')

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

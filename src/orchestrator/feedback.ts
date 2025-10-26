import { LLMAdapter } from '../adapters/llm/interface'

export type Issue = {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  evidence?: string
  location?: { path?: string; line?: number }
}

export type SteeringAction = {
  id: string
  type: 'file-edit' | 'run-command' | 'rerun-agent' | 'adjust-prompt' | 'noop'
  description: string
  safe: boolean
  patch?: { path: string; diff: string }
  command?: { cmd: string; cwd?: string; env?: Record<string, string> }
}

export type FeedbackReport = {
  verdict: 'complete' | 'partial' | 'incomplete' | 'fail'
  confidence: number
  rationale: string
  issues: Issue[]
  steering: SteeringAction[]
  metrics?: Record<string, any>
}

/**
 * Analyze a single iteration's agent output using an LLM and return a structured FeedbackReport.
 * This is intentionally lightweight: it tries to parse JSON from the model and falls back to
 * a best-effort verdict when parsing fails.
 */
export async function analyzeIteration(opts: {
  llm: LLMAdapter
  runId: string
  iteration: number
  task: string
  agentOutput: { text: string }
}): Promise<FeedbackReport> {
  const { llm, iteration, task, agentOutput } = opts

  const sys = {
    role: 'system' as const,
    content:
      'You are an automated reviewer. Reply with a JSON object exactly matching the schema: {verdict,confidence,rationale,issues,steering}. Keep the JSON compact.'
  }

  const user = {
    role: 'user' as const,
    content: `Task: ${task}\nIteration: ${iteration}\nAgent output:\n${agentOutput?.text || ''}\n\nReturn JSON: {verdict,confidence,rationale,issues,steering}`
  }

  let llmRes
  try {
    llmRes = await llm.call([sys, user], { maxTokens: 512 })
  } catch (e: any) {
    return {
      verdict: 'incomplete',
      confidence: 0,
      rationale: `LLM call failed: ${String(e)}`,
      issues: [
        { id: 'llm-call-failed', type: 'other', severity: 'high', message: 'LLM call failed', evidence: String(e) }
      ],
      steering: []
    }
  }

  const text = llmRes?.text || ''

  try {
    const parsed = JSON.parse(text)
    // Basic validation & defaults
    return {
      verdict: parsed.verdict || 'incomplete',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      rationale: parsed.rationale || String(text).slice(0, 1000),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      steering: Array.isArray(parsed.steering) ? parsed.steering : [],
      metrics: parsed.metrics || {}
    }
  } catch (err) {
    // Fallback heuristic: look for a yes-like token
    const normalized = (text || '').toLowerCase()
    const isYes = normalized.includes('complete') || normalized.includes('yes') || normalized.includes('done')
    return {
      verdict: isYes ? 'complete' : 'incomplete',
      confidence: isYes ? 0.6 : 0.4,
      rationale: String(text).slice(0, 200),
      issues: [],
      steering: []
    }
  }
}

export default analyzeIteration

import type { OrchestratorStatus, WhatDone } from '../types/models'
import { getLLMAdapter } from '../adapters/llm'

export function routeWhatDone(what: WhatDone): OrchestratorStatus {
  switch (what) {
    case 'spec_implemented':
      return 'awaiting_review'
    case 'completed_task':
      return 'idle'
    case 'needs_clarification':
      return 'needs_clarification'
    case 'failed':
    default:
      return 'changes_requested'
  }
}

export function isValidWhatDone(value: string): value is WhatDone {
  return (
    value === 'spec_implemented' || value === 'completed_task' || value === 'needs_clarification' || value === 'failed'
  )
}

/**
 * Lightweight rule-based classifier that assigns scores to signals
 * and returns the most probable outcome. This is deterministic and
 * test-friendly. For uncertain/close calls it returns `needs_clarification`.
 */
function ruleBasedWhatDone(text: string): WhatDone {
  const t = (text || '').toLowerCase()
  const score: Record<WhatDone, number> = {
    spec_implemented: 0,
    completed_task: 0,
    needs_clarification: 0,
    failed: 0
  }

  // signals (positive => +weight, negative => +weight for failed)
  const signals: Array<{ key: string; kind: WhatDone; weight: number }> = [
    { key: 'spec implemented', kind: 'spec_implemented', weight: 3 },
    { key: 'implemented the spec', kind: 'spec_implemented', weight: 3 },
    { key: 'all requirements met', kind: 'spec_implemented', weight: 3 },
    { key: 'requirements satisfied', kind: 'spec_implemented', weight: 3 },
    { key: 'passes tests', kind: 'spec_implemented', weight: 2 },
    { key: 'tests passed', kind: 'spec_implemented', weight: 2 },

    { key: 'completed task', kind: 'completed_task', weight: 2 },
    { key: 'task completed', kind: 'completed_task', weight: 2 },
    { key: '\n- done\n', kind: 'completed_task', weight: 1 },

    { key: 'needs clarification', kind: 'needs_clarification', weight: 3 },
    { key: 'please clarify', kind: 'needs_clarification', weight: 2 },
    { key: 'clarify', kind: 'needs_clarification', weight: 1 },

    { key: 'failed', kind: 'failed', weight: 3 },
    { key: 'failing', kind: 'failed', weight: 2 },
    { key: 'tests failed', kind: 'failed', weight: 3 },
    { key: 'type error', kind: 'failed', weight: 2 },
    { key: 'lint failed', kind: 'failed', weight: 2 },
    { key: 'not implemented', kind: 'failed', weight: 2 }
  ]

  for (const s of signals) {
    if (t.includes(s.key)) score[s.kind] += s.weight
  }

  // preserve prior behavior: if there are both positive and negative
  // signals in the text, prefer 'needs_clarification'
  const positiveKeywords = ['spec implemented', 'implemented the spec', 'all requirements met', 'requirements satisfied', 'passes tests', 'tests passed', 'completed task', 'task completed', '\bdone\b']
  const negativeKeywords = ['failed', 'failing', 'tests failed', 'type error', 'lint failed', 'not implemented', 'error']
  const hasPositive = positiveKeywords.some((k) => t.includes(k))
  const hasNegative = negativeKeywords.some((k) => t.includes(k))
  if (hasPositive && hasNegative) return 'needs_clarification'

  // find max
  const entries = Object.entries(score) as Array<[WhatDone, number]>
  entries.sort((a, b) => b[1] - a[1])
  const [best, bestScore] = entries[0]
  const [, secondScore] = entries[1]

  // if top two are tied or top score is zero, return needs_clarification
  if (bestScore === 0 || bestScore === secondScore) return 'needs_clarification'
  return best
}

/**
 * Optionally use an LLM to classify the agent output. Controlled via
 * AO_USE_LLM_EVAL=1. The LLM adapter should return a short label (one of
 * spec_implemented, completed_task, needs_clarification, failed) or a
 * short explanation. We tolerate free-form outputs by mapping known words.
 */
export async function whatDoneFromTextAsync(text: string): Promise<WhatDone> {
  if (process.env.AO_USE_LLM_EVAL !== '1') return ruleBasedWhatDone(text)

  try {
    const llm = getLLMAdapter(process.env.AO_LLM_PROVIDER || 'passthrough', {})
    const prompt = `Classify the following agent run output into one of: spec_implemented, completed_task, needs_clarification, failed. Respond with only the label.\n\nOutput:\n${text}`
    const out = await llm.generate({ prompt, temperature: 0 })
    const t = (out.text || '').toLowerCase()
    if (t.includes('spec_implemented') || t.includes('spec implemented') || t.includes('implemented')) return 'spec_implemented'
    if (t.includes('completed_task') || t.includes('task completed') || t.includes('\bdone\b')) return 'completed_task'
    if (t.includes('needs_clarification') || t.includes('clarify') || t.includes('please clarify')) return 'needs_clarification'
    if (t.includes('failed') || t.includes('failing') || t.includes('tests failed') || t.includes('error')) return 'failed'
  } catch {
    // fall through to rule-based
  }
  return ruleBasedWhatDone(text)
}

// Backwards compatible synchronous function that uses async evaluator if
// AO_USE_LLM_EVAL is not enabled.
export function whatDoneFromText(text: string): WhatDone {
  // If async LLM eval is requested but caller used sync API, fall back to rules
  if (process.env.AO_USE_LLM_EVAL === '1') {
    // best-effort: call rule-based and note that LLM could be more accurate
    return ruleBasedWhatDone(text)
  }
  return ruleBasedWhatDone(text)
}

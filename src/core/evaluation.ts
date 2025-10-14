import type { OrchestratorStatus, WhatDone } from '../types/models'

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

export function whatDoneFromText(text: string): WhatDone {
  const t = (text || '').toLowerCase()
  // strong positive indicators
  const positives = ['spec implemented', 'implemented the spec', 'all requirements met', 'requirements satisfied', 'passes tests', 'tests passed']
  // completed indicators
  const completed = ['completed task', 'task completed', 'done']
  // clarification indicators
  const clarify = ['needs clarification', 'needs clarif', 'please clarify', 'clarify']
  // negative/failure indicators
  const negatives = ['failed', 'failing', 'error', 'not implemented', 'tests failed', 'type error', 'lint failed']

  const pos = positives.some((p) => t.includes(p))
  const comp = completed.some((p) => t.includes(p))
  const cl = clarify.some((p) => t.includes(p))
  const neg = negatives.some((p) => t.includes(p))

  // If both positive and negative signals present, ask for clarification
  if ((pos || comp) && neg) return 'needs_clarification'
  if (pos) return 'spec_implemented'
  if (comp) return 'completed_task'
  if (cl) return 'needs_clarification'
  if (neg) return 'failed'

  // fallback: ambiguous -> needs clarification
  return 'needs_clarification'
}

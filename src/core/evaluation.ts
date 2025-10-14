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
  const t = text.toLowerCase()
  if (t.includes('spec implemented')) return 'spec_implemented'
  if (t.includes('completed task')) return 'completed_task'
  if (t.includes('needs clarification')) return 'needs_clarification'
  return 'failed'
}

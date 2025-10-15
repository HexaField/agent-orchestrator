import { getLLMAdapter } from '../adapters/llm'

export type ReviewStatus = 'pending' | 'approved' | 'changes_requested'

export interface ReviewResult {
  required: boolean
  status: ReviewStatus
  notes: string
}

function heuristicReview(diff: string): ReviewResult {
  const lines = diff.split('\n')
  const files = new Set<string>()
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.startsWith('+++ b/')) files.add(l.slice(6).trim())
    if (l.startsWith('--- a/')) files.add(l.slice(6).trim())
    if (l.startsWith('+') && !l.startsWith('+++')) added++
    if (l.startsWith('-') && !l.startsWith('---')) removed++
  }
  const totalChanges = added + removed
  const fileCount = files.size

  // Heuristics:
  // - Very small changes (<=5 lines) and touching only docs or markdown -> auto-approve
  // - Changes that touch test files are considered higher risk and require review
  // - Large diffs (>500 lines or >20 files) require human review
  const touchesTest = Array.from(files).some(
    (f) => f.includes('test') || f.includes('__tests__') || f.endsWith('.spec.ts')
  )
  const onlyDocs = Array.from(files).every((f) => f.endsWith('.md') || f.endsWith('.txt'))

  if (onlyDocs && totalChanges <= 50) {
    return { required: false, status: 'approved', notes: 'Docs-only small change: auto-approved by heuristic.' }
  }

  if (!touchesTest && totalChanges <= 5 && fileCount <= 2) {
    return { required: false, status: 'approved', notes: 'Small tweak: auto-approved by heuristic.' }
  }

  if (totalChanges > 500 || fileCount > 20) {
    return { required: true, status: 'changes_requested', notes: 'Large change: requires human review.' }
  }

  if (touchesTest) {
    return {
      required: true,
      status: 'changes_requested',
      notes: 'Tests or test-related files modified: require human review.'
    }
  }

  // default to pending human review
  return { required: true, status: 'pending', notes: 'Requires human review by default.' }
}

export async function reviewCodeAsync(diff: string): Promise<ReviewResult> {
  // Optional LLM-assisted review (opt-in)
  if (process.env.AO_USE_LLM_REVIEW === '1') {
    try {
      const provider = process.env.AO_LLM_PROVIDER || 'passthrough'
      const llm = getLLMAdapter(provider, { endpoint: process.env.AO_LLM_ENDPOINT, model: process.env.AO_LLM_MODEL })
      const prompt = `Review the following git diff and respond with one of: approved, changes_requested, pending. Provide a short reason.\n\nDiff:\n${diff}`
      const out = await llm.generate({ prompt, temperature: 0 })
      const txt = (out.text || '').toLowerCase()
      if (txt.includes('approved') && !txt.includes('changes'))
        return { required: false, status: 'approved', notes: out.text }
      if (txt.includes('changes_requested') || txt.includes('changes requested') || txt.includes('needs changes'))
        return { required: true, status: 'changes_requested', notes: out.text }
      if (txt.includes('pending') || txt.includes('needs review'))
        return { required: true, status: 'pending', notes: out.text }
      // fallback to heuristic
    } catch {
      // ignore LLM failures and fallback to heuristics
    }
  }
  return heuristicReview(diff)
}

// Backwards-compatible sync wrapper for existing callers that expect a sync function.
export function reviewCode(diff: string): ReviewResult {
  // If async LLM review is enabled, prefer async path but fall back to heuristics
  if (process.env.AO_USE_LLM_REVIEW === '1') {
    // best-effort: call heuristic and leave hint that LLM review is available
    const h = heuristicReview(diff)
    if (h.status === 'approved') h.notes = h.notes + ' (LLM-review available if enabled)'
    return h
  }
  return heuristicReview(diff)
}

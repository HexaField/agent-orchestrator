import { marked } from 'marked'
import type { NextTask } from '../types/models'
import { genChangeLLM, genClarifyLLM, genContextLLM } from './generatorClient'
import { readTemplateFileSync, renderTemplateSync } from './templateLoader'

export function genChecklist(spec: string): string[] {
  const text = spec || ''
  const items = new Set<string>()
  // naive derivation: collect headings as checklist items; fallback to generic
  const lexer = marked.lexer(text)
  for (const tok of lexer) {
    if (tok.type === 'heading' && 'text' in tok && (tok as any).depth <= 3) {
      const t = String((tok as any).text).trim()
      if (t) items.add(t)
    }
  }
  if (items.size === 0) {
    items.add('Implement specification requirements')
  }
  return Array.from(items)
}

export function genContext(spec?: string): string {
  const summary = spec ? spec.split('\n').slice(0, 4).join(' ').trim() : ''
  const ctx = summary || 'No specification summary available.'
  const rendered = renderTemplateSync(process.cwd(), 'context.md', { summary: ctx })
  if (typeof rendered !== 'string') throw new Error('Missing required template: .agent/templates/context.md')
  return rendered
}

export async function genResponseType(): Promise<'patches' | 'files' | 'commands' | 'mixed'> {
  try {
    const { getEffectiveConfig } = await import('../config')
    const cfg = await getEffectiveConfig(process.cwd())
    const r = cfg.RESPONSE_TYPE
    if (r === 'patches' || r === 'files' || r === 'commands' || r === 'mixed') return r
  } catch {}
  return 'mixed'
}

export function genReviewChanges(): string {
  const rendered = renderTemplateSync(process.cwd(), 'reviewChanges.md', {})
  if (typeof rendered !== 'string') throw new Error('Missing required template: .agent/templates/reviewChanges.md')
  return rendered
}

export function genClarify(spec?: string): string {
  const rendered = renderTemplateSync(process.cwd(), 'clarify.md', { spec: spec || '' })
  if (typeof rendered !== 'string') throw new Error('Missing required template: .agent/templates/clarify.md')
  return rendered
}

export function genChange(spec?: string, reason?: string): import('../types/models').NextTask {
  // Read the raw template so we can safely JSON-escape inserted values when the
  // template contains an embedded JSON block. This prevents invalid JSON when
  // %spec% contains newlines or quotes.
  const raw = readTemplateFileSync(process.cwd(), 'change.md')
  if (typeof raw !== 'string') throw new Error('Missing required template: .agent/templates/change.md')

  // Prepare escaped replacements for JSON contexts
  const esc = (s: string) => JSON.stringify(s).slice(1, -1)
  const safeSpec = esc(spec || '')
  const safeReason = esc(reason || '')

  // Substitute placeholders conservatively for parsing the JSON block.
  const substituted = raw.replace(/%spec%/g, safeSpec).replace(/%reason%/g, safeReason)

  const jsonMatch = substituted.match(/```json\n([\s\S]*?)\n```/) || substituted.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    // If there's no JSON block, fall back to a simple deterministic task
    // using the provided spec/reason.
    return {
      id: 'rec-' + Math.random().toString(36).slice(2, 8),
      title: `Changes requested: ${reason || 'update'}`,
      summary: `Please update the following: ${spec || ''}`,
      acceptanceCriteria: ['Address review comments'],
      createdAt: new Date().toISOString()
    }
  }

  const jsonText = jsonMatch[1] ? jsonMatch[1] : jsonMatch[0]
  try {
    const obj = JSON.parse(jsonText)
    if (!obj || typeof obj.title !== 'string' || typeof obj.summary !== 'string')
      throw new Error('change.md JSON did not match NextTask shape')
    return {
      id: obj.id || 'rec-' + Math.random().toString(36).slice(2, 8),
      title: obj.title,
      summary: obj.summary,
      acceptanceCriteria: Array.isArray(obj.acceptanceCriteria) ? obj.acceptanceCriteria : ['Address review comments'],
      createdAt: new Date().toISOString()
    }
  } catch {
    // Parsing failed even after escaping — fall back deterministically.
    return {
      id: 'rec-' + Math.random().toString(36).slice(2, 8),
      title: `Changes requested: ${reason || 'update'}`,
      summary: `Please update the following: ${spec || ''}`,
      acceptanceCriteria: ['Address review comments'],
      createdAt: new Date().toISOString()
    }
  }
}

export function genUpdate(result: {
  whatDone: 'spec_implemented' | 'completed_task' | 'needs_clarification' | 'failed'
  verification?: any
}): { progressPatch: import('./progress').ProgressPatch; status: string } {
  const statusMap: Record<string, string> = {
    spec_implemented: 'awaiting_review',
    completed_task: 'idle',
    needs_clarification: 'needs_clarification',
    failed: 'changes_requested'
  }
  const status = statusMap[result.whatDone] ?? 'idle'
  const patch = { status } as import('./progress').ProgressPatch
  if (result.whatDone === 'needs_clarification') {
    patch.clarifications = 'Pending clarification questions.'
  }
  return { progressPatch: patch, status }
}

export function genNext(): NextTask {
  return {
    id: 'task-' + Math.random().toString(36).slice(2, 8),
    title: 'Follow-up task',
    summary: 'Next step in the workflow',
    acceptanceCriteria: ['Done'],
    createdAt: new Date().toISOString()
  }
}

// Async LLM-backed wrappers (used when USE_LLM_GEN=1)
export async function genContextAsync(spec?: string): Promise<string> {
  try {
    const { getEffectiveConfig } = await import('../config')
    const cfg = await getEffectiveConfig(process.cwd())
    if (!cfg || !cfg.USE_LLM_GEN) return genContext(spec)
    const provider = cfg.LLM_PROVIDER || 'ollama'
    return genContextLLM(provider, spec)
  } catch {
    return genContext(spec)
  }
}

export async function genClarifyAsync(spec?: string): Promise<string> {
  try {
    const { getEffectiveConfig } = await import('../config')
    const cfg = await getEffectiveConfig(process.cwd())
    if (!cfg || !cfg.USE_LLM_GEN) return genClarify(spec)
    const provider = cfg.LLM_PROVIDER || 'ollama'
    return genClarifyLLM(provider, spec)
  } catch {
    return genClarify(spec)
  }
}

export async function genChangeAsync(spec?: string, reason?: string): Promise<NextTask> {
  try {
    const { getEffectiveConfig } = await import('../config')
    const cfg = await getEffectiveConfig(process.cwd())
    if (!cfg || !cfg.USE_LLM_GEN) return genChange(spec, reason)
    const provider = cfg.LLM_PROVIDER || 'ollama'
    try {
      const text = await genChangeLLM(provider, spec, reason)
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const jsonText = jsonMatch[1] ? jsonMatch[1] : jsonMatch[0]
        try {
          const obj = JSON.parse(jsonText)
          if (obj && typeof obj.title === 'string' && typeof obj.summary === 'string') {
            return {
              id: obj.id || 'rec-' + Math.random().toString(36).slice(2, 8),
              title: obj.title,
              summary: obj.summary,
              acceptanceCriteria: Array.isArray(obj.acceptanceCriteria)
                ? obj.acceptanceCriteria
                : ['Address review comments'],
              createdAt: new Date().toISOString()
            }
          }
        } catch {}
      }
    } catch {}
  } catch {}

  const fallback = genChange(spec, reason)
  fallback.summary = `LLM output could not be parsed as JSON. Fallback: ${fallback.summary}`
  return fallback
}

import fs from 'fs'
import { marked } from 'marked'
import path from 'path'
import type { NextTask } from '../types/models'
import { genChangeLLM, genClarifyLLM, genContextLLM } from './generatorClient'

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
  return `Context summary: ${ctx}\n\nUse the checklist and acceptance criteria to guide changes.`
}

export function genResponseType(): 'patches' | 'files' | 'commands' | 'mixed' {
  // Read project config synchronously and return RESPONSE_TYPE if set.
  try {
    const cfgPath = path.join(process.cwd(), '.agent', 'config.json')
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf8')
      const cfg = JSON.parse(raw)
      if (cfg && (cfg as any).RESPONSE_TYPE) {
        const r = (cfg as any).RESPONSE_TYPE
        if (r === 'patches' || r === 'files' || r === 'commands' || r === 'mixed') return r
      }
    }
  } catch {}
  return 'mixed'
}

export function genReviewChanges(): string {
  return 'Summary of changes.'
}

export function genClarify(spec?: string): string {
  // derive simple clarifying questions from heading structure
  if (!spec) return 'Please clarify the ambiguous requirements.'
  const lexer = marked.lexer(spec)
  const qs: string[] = []
  for (const tok of lexer) {
    if (tok.type === 'heading' && (tok as any).depth === 2) {
      const t = String((tok as any).text).trim()
      qs.push(`What are the acceptance criteria for '${t}'?`)
    }
  }
  if (qs.length === 0) qs.push('Please clarify the overall acceptance criteria for this spec.')
  return qs.join('\n')
}

export function genChange(spec?: string, reason?: string): import('../types/models').NextTask {
  const id = 'rec-' + Math.random().toString(36).slice(2, 8)
  const title = reason ? `Changes requested: ${reason}` : 'Recommended change'
  const summary = spec
    ? `Please update the following based on the spec: ${spec.split('\n').slice(0, 2).join(' ')}`
    : 'Please address the requested changes in the review.'
  const acceptance = ['Address review comments']
  return {
    id,
    title,
    summary,
    acceptanceCriteria: acceptance,
    createdAt: new Date().toISOString()
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

// Async LLM-backed wrappers (used when AO_USE_LLM_GEN=1)
export async function genContextAsync(spec?: string): Promise<string> {
  // Prefer project-level configuration only (no env fallback)
  try {
    const { ensureProjectConfig, readProjectConfig } = await import('../config')
    // prefer explicit project config; fall back to env-based seed when present
    const cfg = (await readProjectConfig(process.cwd())) || (await ensureProjectConfig(process.cwd()))
    if (!cfg || !(cfg as any).USE_LLM_GEN) return genContext(spec)
    const provider = (cfg as any).LLM_PROVIDER || 'passthrough'
    return genContextLLM(provider, spec)
  } catch {
    return genContext(spec)
  }
}

export async function genClarifyAsync(spec?: string): Promise<string> {
  try {
    const { ensureProjectConfig, readProjectConfig } = await import('../config')
    const cfg = (await readProjectConfig(process.cwd())) || (await ensureProjectConfig(process.cwd()))
    if (!cfg || !(cfg as any).USE_LLM_GEN) return genClarify(spec)
    const provider = (cfg as any).LLM_PROVIDER || 'passthrough'
    return genClarifyLLM(provider, spec)
  } catch {
    return genClarify(spec)
  }
}

export async function genChangeAsync(spec?: string, reason?: string): Promise<NextTask> {
  // Use project config only to decide if we call the LLM for generation
  try {
    const { ensureProjectConfig, readProjectConfig } = await import('../config')
    const cfg = (await readProjectConfig(process.cwd())) || (await ensureProjectConfig(process.cwd()))
    if (!cfg || !(cfg as any).USE_LLM_GEN) return genChange(spec, reason)
    const provider = (cfg as any).LLM_PROVIDER || 'passthrough'
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

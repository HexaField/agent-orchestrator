import { marked } from 'marked';
import type { NextTask } from '../types/models';

export function genChecklist(spec: string): string[] {
  const text = spec || '';
  const items = new Set<string>();
  // naive derivation: collect headings as checklist items; fallback to generic
  const lexer = marked.lexer(text);
  for (const tok of lexer) {
    if (tok.type === 'heading' && 'text' in tok && (tok as any).depth <= 3) {
      const t = String((tok as any).text).trim();
      if (t) items.add(t);
    }
  }
  if (items.size === 0) {
    items.add('Implement specification requirements');
  }
  return Array.from(items);
}

export function genContext(): string {
  return 'Provide concise, relevant context only.';
}

export function genResponseType(): 'patches' | 'files' | 'commands' | 'mixed' {
  return 'mixed';
}

export function genReviewChanges(): string {
  return 'Summary of changes.';
}

export function genClarify(): string {
  return 'List ambiguities and ask targeted questions.';
}

export function genChange(): string {
  return 'Actionable change requests.';
}

export function genUpdate(result: { whatDone: 'spec_implemented' | 'completed_task' | 'needs_clarification' | 'failed'; verification?: any }): { progressPatch: import('./progress').ProgressPatch; status: string } {
  const statusMap: Record<string, string> = {
    spec_implemented: 'awaiting_review',
    completed_task: 'idle',
    needs_clarification: 'needs_clarification',
    failed: 'changes_requested',
  };
  const status = statusMap[result.whatDone] ?? 'idle';
  const patch = { status } as import('./progress').ProgressPatch;
  if (result.whatDone === 'needs_clarification') {
    patch.clarifications = 'Pending clarification questions.';
  }
  return { progressPatch: patch, status };
}

export function genNext(): NextTask {
  return {
    id: 'task-' + Math.random().toString(36).slice(2, 8),
    title: 'Follow-up task',
    summary: 'Next step in the workflow',
    acceptanceCriteria: ['Done'],
    createdAt: new Date().toISOString(),
  };
}

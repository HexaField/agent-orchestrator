import { genChecklist } from '../core/templates';

export function deriveChecklistFromSpec(spec: string): string[] {
  const items = genChecklist(spec);
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Checklist must be non-empty');
  }
  return items;
}

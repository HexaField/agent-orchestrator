import { describe, it, expect } from 'vitest';
import { deriveChecklistFromSpec } from '../../src/validation/checklist';

describe('validation/checklist', () => {
  it('derives non-empty checklist from minimal spec', () => {
    const spec = '# Title\n\nSome details.';
    const items = deriveChecklistFromSpec(spec);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });
});

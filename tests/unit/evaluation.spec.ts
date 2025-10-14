import { describe, it, expect } from 'vitest';
import { routeWhatDone, isValidWhatDone } from '../../src/core/evaluation';

describe('core/evaluation', () => {
  it('isValidWhatDone allows only enums', () => {
    expect(isValidWhatDone('spec_implemented')).toBe(true);
    expect(isValidWhatDone('completed_task')).toBe(true);
    expect(isValidWhatDone('needs_clarification')).toBe(true);
    expect(isValidWhatDone('failed')).toBe(true);
    expect(isValidWhatDone('nope')).toBe(false);
  });

  it('routeWhatDone maps correctly', () => {
    expect(routeWhatDone('spec_implemented')).toBe('awaiting_review');
    expect(routeWhatDone('completed_task')).toBe('idle');
    expect(routeWhatDone('needs_clarification')).toBe('needs_clarification');
    expect(routeWhatDone('failed')).toBe('changes_requested');
  });
});

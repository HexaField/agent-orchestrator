import { describe, it, expect } from 'vitest'
import { whatDoneFromText } from '../../src/core/evaluation'

describe('whatDoneFromText heuristics', () => {
  it('detects spec implemented from positive phrases', () => {
    expect(whatDoneFromText('The run: Spec Implemented; all requirements met.')).toBe('spec_implemented')
    expect(whatDoneFromText('All requirements satisfied and tests passed')).toBe('spec_implemented')
  })

  it('detects completed task', () => {
    expect(whatDoneFromText('Task completed successfully')).toBe('completed_task')
  })

  it('detects needs clarification for ambiguous or mixed messages', () => {
    expect(whatDoneFromText('Spec implemented but tests failed')).toBe('needs_clarification')
    expect(whatDoneFromText('I am not sure, please clarify the acceptance criteria')).toBe('needs_clarification')
  })

  it('detects failure when negative signals only', () => {
    expect(whatDoneFromText('Tests failed with errors')).toBe('failed')
  })
})

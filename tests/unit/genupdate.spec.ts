import { describe, it, expect } from 'vitest'
import { genUpdate } from '../../src/core/templates'

describe('genUpdate mapping', () => {
  it('maps whatDone to status correctly', () => {
    const s1 = genUpdate({ whatDone: 'spec_implemented' as any })
    expect(s1.status).toBe('awaiting_review')
    const s2 = genUpdate({ whatDone: 'completed_task' as any })
    expect(s2.status).toBe('idle')
    const s3 = genUpdate({ whatDone: 'needs_clarification' as any })
    expect(s3.status).toBe('needs_clarification')
    const s4 = genUpdate({ whatDone: 'failed' as any })
    expect(s4.status).toBe('changes_requested')
  })
})

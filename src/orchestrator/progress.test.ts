import { describe, test, expect } from 'vitest'
import Ajv from 'ajv'
import progressJsonSchema from '../types/progressSchema'

describe('progress schema', () => {
  test('validates a minimal progress object', () => {
    const ajv = new Ajv({ allErrors: true, strict: false })
    const validate = ajv.compile(progressJsonSchema as any)

    const sample = {
      runId: 'run-123',
      createdAt: new Date().toISOString(),
      spec: 'specs/my-spec.md',
      phase: 'implement',
      tasks: [
        {
          id: 't-1',
          title: 'Apply patch',
          type: 'diff',
          status: 'pending',
          provenancePath: null,
          verification: null,
          review: null,
        },
      ],
      summary: { success: true, errors: [] },
    }

    const valid = validate(sample)
    if (!valid) {
      // eslint-disable-next-line no-console
      console.error('schema errors:', validate.errors)
    }
    expect(valid).toBe(true)
  })
})

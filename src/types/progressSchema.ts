/**
 * Progress schema and TypeScript types for run progress persistence.
 * This mirrors the recommended minimal schema in the Phase 3/4 implementation plan.
 */

export type TaskType = 'diff' | 'exec' | 'llm-call' | 'meta'

export type TaskStatus =
  | 'pending'
  | 'in-progress'
  | 'applied'
  | 'verified'
  | 'blocked'
  | 'skipped'

export type CheckStatus = 'pass' | 'fail' | 'skipped'

export type VerificationCheck = {
  name: string
  status: CheckStatus
  outputPath?: string | null
}

export type Verification = {
  checks: VerificationCheck[]
  status: 'pass' | 'fail' | 'partial'
}

export type Review = {
  state: 'unreviewed' | 'approved' | 'changes_requested' | 'commented'
  by?: string | null
  at?: string | null // ISO-8601
  notes?: string | null
}

export type Task = {
  id: string
  title: string
  type: TaskType
  status: TaskStatus
  appliedAt?: string | null
  provenancePath?: string | null
  verification?: Verification | null
  review?: Review | null
}

export type ProgressSummary = {
  success: boolean
  errors: string[]
}

export type Progress = {
  runId: string
  createdAt: string // ISO-8601
  spec?: string | null
  phase?: string | null
  tasks: Task[]
  summary?: ProgressSummary | null
}

/**
 * JSON Schema suitable for validation with Ajv.
 * Keep it explicit and fairly strict about types, but allow nullable fields where appropriate.
 */
export const progressJsonSchema = {
  $id: 'https://hexafield.dev/schemas/progress.json',
  type: 'object',
  additionalProperties: false,
  required: ['runId', 'createdAt', 'tasks'],
  properties: {
    runId: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    spec: { type: ['string', 'null'] },
    phase: { type: ['string', 'null'] },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'type', 'status'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          type: { enum: ['diff', 'exec', 'llm-call', 'meta'] },
          status: {
            enum: ['pending', 'in-progress', 'applied', 'verified', 'blocked', 'skipped'],
          },
          appliedAt: { type: ['string', 'null'], format: 'date-time' },
          provenancePath: { type: ['string', 'null'] },
          verification: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['checks', 'status'],
            properties: {
              checks: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['name', 'status'],
                  properties: {
                    name: { type: 'string' },
                    status: { enum: ['pass', 'fail', 'skipped'] },
                    outputPath: { type: ['string', 'null'] },
                  },
                },
              },
              status: { enum: ['pass', 'fail', 'partial'] },
            },
          },
          review: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['state'],
            properties: {
              state: {
                enum: ['unreviewed', 'approved', 'changes_requested', 'commented'],
              },
              by: { type: ['string', 'null'] },
              at: { type: ['string', 'null'], format: 'date-time' },
              notes: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
    summary: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['success', 'errors'],
      properties: {
        success: { type: 'boolean' },
        errors: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const

export default progressJsonSchema

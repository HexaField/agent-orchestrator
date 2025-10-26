import fs from 'fs'

export type ProvenanceEvent = {
  runId?: string
  name?: string
  type: string
  payload: Record<string, unknown>
  timestamp?: string
}

/**
 * Append a JSONL provenance event to a file. Creates the file if needed.
 * The function is synchronous to avoid race conditions in tests; callers may wrap it if desired.
 */
export function appendProvenanceEvent(filePath: string, event: ProvenanceEvent): void {
  const e = { ...event, timestamp: event.timestamp || new Date().toISOString() }
  const line = JSON.stringify(e) + '\n'
  try {
    fs.appendFileSync(filePath, line, { encoding: 'utf8' })
  } catch (err) {
    // bubble up; tests will fail if provenance cannot be written
    throw err
  }
}

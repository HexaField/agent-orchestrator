/**
 * Normalize raw parser/extractor events into canonical SessionEvent shapes
 * used by the orchestrator and tests.
 */
import { SessionEvent } from '../../types/adapters'

export function normalizeSessionEvent(ev: any): SessionEvent | null {
  try {
    if (!ev) return null
    // already normalized
    if (
      ev &&
      typeof ev.type === 'string' &&
      (ev.type === 'stdout' ||
        ev.type === 'ndjson' ||
        ev.type === 'clarify' ||
        ev.type === 'artifact' ||
        ev.type === 'finish' ||
        ev.type === 'error')
    ) {
      return ev as SessionEvent
    }
    // NDJSON raw object -> ndjson
    if (typeof ev === 'object' && (ev.aggregated_output || ev.response || ev.thinking || ev.item)) {
      return { type: 'ndjson', json: ev }
    }
    // artifact markers from extractor emit objects with path/content
    if (typeof ev === 'object' && (ev.path || ev.content) && (ev.path || ev.content)) {
      return { type: 'artifact', path: ev.path, content: ev.content }
    }
    // raw strings (stdout) -> stdout event
    if (typeof ev === 'string') return { type: 'stdout', text: ev }
    return null
  } catch {
    return null
  }
}

export default { normalizeSessionEvent }

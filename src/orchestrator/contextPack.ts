import fs from 'fs/promises'
import path from 'path'
import progressApi from './progress'

export type ProvenanceEntry = {
  file: string
  content?: unknown
}

export type ContextPack = {
  runId: string
  createdAt?: string
  spec?: string | null
  phase?: string | null
  tasks?: unknown[]
  recentProvenance: ProvenanceEntry[]
  memory: Record<string, unknown>
  checklist?: string[]
  adapters: { fs: boolean; exec: boolean; llm: boolean; agent: boolean }
}

const RUNS_BASE = path.join(process.cwd(), '.agent', 'run')

function runDir(runId: string) {
  return path.join(RUNS_BASE, runId)
}

export async function buildContextPack(runId: string, options?: { maxProvenance?: number }): Promise<ContextPack> {
  const max = options?.maxProvenance ?? 5
  const run = runDir(runId)
  // read progress if available
  let progress = null
  try {
    progress = await progressApi.readProgress(runId)
  } catch (e) {
    // ignore
  }

  // list recent provenance files
  const provDir = path.join(run, 'provenance')
  let recent: ProvenanceEntry[] = []
  try {
    const files = await fs.readdir(provDir)
    // sort by name (assumes seq in filename) and take last `max`
    const sorted = files.sort()
    const selected = sorted.slice(-max)
    recent = await Promise.all(
      selected.map(async (f) => {
        const p = path.join(provDir, f)
        try {
          const raw = await fs.readFile(p, 'utf8')
          let parsed: unknown = raw
          try {
            parsed = JSON.parse(raw)
          } catch {
            parsed = raw
          }
          return { file: f, content: parsed }
        } catch {
          return { file: f }
        }
      })
    )
  } catch {
    recent = []
  }

  const cp: ContextPack = {
    runId,
    createdAt: progress?.createdAt,
    spec: progress?.spec ?? null,
    phase: progress?.phase ?? null,
    tasks: progress?.tasks ?? [],
    recentProvenance: recent,
    memory: {},
    checklist: undefined,
    adapters: { fs: true, exec: true, llm: true, agent: true },
  }

  // derive checklist if present in tasks or progress.summary (simple heuristic)
  if (Array.isArray(cp.tasks)) {
    const checklist = cp.tasks.map((t: any) => (t && t.title ? String(t.title) : null)).filter(Boolean)
    if (checklist.length) cp.checklist = checklist as string[]
  }

  return cp
}

export default { buildContextPack }

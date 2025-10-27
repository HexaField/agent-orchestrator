import fs from 'fs/promises'
import path from 'path'
import Ajv from 'ajv'
import progressJsonSchema, { Progress } from '../types/progressSchema'

const ajv = new Ajv({ allErrors: true, strict: false })
const validate = ajv.compile(progressJsonSchema as any)

const RUNS_BASE = path.join(process.cwd(), '.agent', 'run')

function runDir(runId: string) {
  return path.join(RUNS_BASE, runId)
}

async function fileExists(p: string) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function writeAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${filePath}.tmp`
  const str = JSON.stringify(data, null, 2)
  // write file atomically in same FS
  await fs.writeFile(tmp, str, 'utf8')
  await fs.rename(tmp, filePath)
}

function deepMerge<T>(target: T, patch: Partial<T>): T {
  if (patch == null) return target
  if (typeof target !== 'object' || typeof patch !== 'object') return (patch as any) ?? target
  const out: any = Array.isArray(target) ? [...(target as any)] : { ...(target as any) }
  for (const key of Object.keys(patch as any)) {
    const pv = (patch as any)[key]
    const tv = (target as any)[key]
    if (pv === undefined) continue
    if (pv === null) {
      out[key] = null
    } else if (Array.isArray(pv)) {
      out[key] = pv
    } else if (
      typeof pv === 'object' &&
      pv !== null &&
      typeof tv === 'object' &&
      tv !== null &&
      !Array.isArray(tv)
    ) {
      out[key] = deepMerge(tv, pv)
    } else {
      out[key] = pv
    }
  }
  return out
}

export async function readProgress(runId: string): Promise<Progress | null> {
  const dir = runDir(runId)
  const p = path.join(dir, 'progress.json')
  if (!(await fileExists(p))) return null
  const raw = await fs.readFile(p, 'utf8')
  const obj = JSON.parse(raw)
  const ok = validate(obj)
  if (!ok) {
    const err = new Error('progress.json validation failed: ' + JSON.stringify(validate.errors))
    throw err
  }
  return obj as Progress
}

export async function writeProgress(runId: string, progress: Progress): Promise<void> {
  const dir = runDir(runId)
  await fs.mkdir(dir, { recursive: true })
  const p = path.join(dir, 'progress.json')
  const ok = validate(progress)
  if (!ok) {
    throw new Error('progress object invalid: ' + JSON.stringify(validate.errors))
  }
  await writeAtomic(p, progress)
}

export async function updateProgress(runId: string, patch: Partial<Progress>): Promise<Progress> {
  const dir = runDir(runId)
  await fs.mkdir(dir, { recursive: true })
  const existing = (await readProgress(runId)) ?? { runId, createdAt: new Date().toISOString(), tasks: [] }
  const merged = deepMerge(existing, patch) as Progress
  // ensure runId remains
  merged.runId = runId
  if (!merged.createdAt) merged.createdAt = existing.createdAt || new Date().toISOString()
  // validate
  const ok = validate(merged)
  if (!ok) {
    throw new Error('merged progress invalid: ' + JSON.stringify(validate.errors))
  }
  await writeAtomic(path.join(dir, 'progress.json'), merged)
  // append audit entry
  const audit = { at: new Date().toISOString(), op: 'update', patch }
  const auditLine = JSON.stringify(audit) + '\n'
  const auditPath = path.join(dir, 'progress.audit.log')
  await fs.appendFile(auditPath, auditLine, 'utf8')
  return merged
}

export async function initProgress(runId: string, spec?: string): Promise<Progress> {
  const base: Progress = {
    runId,
    createdAt: new Date().toISOString(),
    spec: spec ?? null,
    phase: null,
    tasks: [],
    summary: null,
  }
  await writeProgress(runId, base)
  await fs.appendFile(path.join(runDir(runId), 'progress.audit.log'), JSON.stringify({ at: new Date().toISOString(), op: 'init' }) + '\n')
  return base
}

export default {
  readProgress,
  writeProgress,
  updateProgress,
  initProgress,
}

import fs from 'fs-extra'
import path from 'path'
import { writeFileAtomic } from '../io/fs'

const PROGRESS = 'progress.json'

export type ProgressItem = {
  done: boolean
  description: string
  notes?: string
}

export type NextTask = {
  id: string
  title: string
  summary: string
  acceptanceCriteria: string[]
  createdAt: string
}

export type ProgressDoc = {
  context?: string
  clarifications?: string
  checklist: ProgressItem[]
  decisions?: string
  status?: string
  nextTask?: NextTask | null
}

export async function readProgress(cwd: string): Promise<string> {
  const p = path.join(cwd, PROGRESS)
  try {
    return await fs.readFile(p, 'utf8')
  } catch {
    return ''
  }
}

export async function readProgressJson(cwd: string): Promise<ProgressDoc> {
  const p = path.join(cwd, PROGRESS)
  try {
    const txt = await fs.readFile(p, 'utf8')
    const obj = JSON.parse(txt)
    // Ensure checklist exists
    if (!Array.isArray((obj as any).checklist)) (obj as any).checklist = []
    return obj as ProgressDoc
  } catch {
    return { checklist: [] }
  }
}

export async function writeProgressJson(cwd: string, doc: ProgressDoc): Promise<void> {
  const p = path.join(cwd, PROGRESS)
  const txt = JSON.stringify(doc, null, 2)
  await writeFileAtomic(p, txt)
}

export type ProgressPatch = {
  status?: string
  clarifications?: string
  decisions?: string
  nextTask?: NextTask | null
  checklist?: string[] | ProgressItem[]
}

export async function applyProgressPatch(cwd: string, patch: ProgressPatch): Promise<void> {
  const doc = await readProgressJson(cwd)
  if (patch.status !== undefined) doc.status = patch.status
  if (patch.clarifications !== undefined) doc.clarifications = patch.clarifications
  if (patch.decisions !== undefined) doc.decisions = patch.decisions
  if (patch.nextTask !== undefined) doc.nextTask = patch.nextTask
  if (patch.checklist !== undefined) {
    // Accept either array of strings or array of ProgressItem
    if (Array.isArray(patch.checklist) && patch.checklist.length > 0) {
      if (typeof patch.checklist[0] === 'string') {
        doc.checklist = (patch.checklist as string[]).map((s) => ({ done: false, description: s }))
      } else {
        doc.checklist = patch.checklist as ProgressItem[]
      }
    } else {
      doc.checklist = []
    }
  }
  await writeProgressJson(cwd, doc)
}

export async function getStatus(cwd: string): Promise<string> {
  const doc = await readProgressJson(cwd)
  return doc.status || 'idle'
}

export function validateAcceptanceCriteria(items: string[] | undefined | null): string[] {
  if (!items) return []
  const cleaned = items
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .slice(0, 20)
  return cleaned
}

export async function readNextTaskAcceptanceCriteria(cwd: string): Promise<string[] | null> {
  const doc = await readProgressJson(cwd)
  if (!doc.nextTask) return null
  return validateAcceptanceCriteria(doc.nextTask.acceptanceCriteria)
}

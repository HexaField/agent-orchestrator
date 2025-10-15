import fs from 'fs-extra'
import path from 'path'
import { writeFileAtomic } from '../io/fs'

const PROGRESS = 'progress.md'

export async function readProgress(cwd: string): Promise<string> {
  const p = path.join(cwd, PROGRESS)
  try {
    return await fs.readFile(p, 'utf8')
  } catch {
    return ''
  }
}

export function splitSections(content: string): { heading: string; body: string }[] {
  const parts = content.split(/^##\s+/m)
  const sections: { heading: string; body: string }[] = []
  if (!parts || parts.length === 0) return sections
  // parts[0] is any leading content before the first heading
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i]
    const firstLineEnd = block.indexOf('\n')
    const heading = firstLineEnd === -1 ? block.trim() : block.slice(0, firstLineEnd).trim()
    const body = firstLineEnd === -1 ? '' : block.slice(firstLineEnd + 1).trim()
    sections.push({ heading, body })
  }
  return sections
}

export async function writeSectionAtomic(cwd: string, heading: string, body: string): Promise<void> {
  const p = path.join(cwd, PROGRESS)
  let content = ''
  try {
    content = await fs.readFile(p, 'utf8')
  } catch {}
  const marker = `## ${heading}`
  if (!content.includes(marker)) {
    content = content + `\n\n${marker}\n\n${body}\n`
  } else {
    const [before, ...rest] = content.split(marker)
    const tail = rest.join(marker)
    const replaced = tail.replace(/^[\s\S]*?\n\n(?=## |$)/m, `\n\n${body}\n\n`)
    content = before + marker + replaced
  }
  await writeFileAtomic(p, content)
}

export async function getStatus(cwd: string): Promise<string> {
  const content = await readProgress(cwd)
  const sections = splitSections(content)
  const s = sections.find((x) => x.heading.toLowerCase() === 'status')
  if (!s) return 'idle'
  return (
    s.body
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? 'idle'
  )
}

export type ProgressPatch = {
  status?: string
  clarifications?: string
  decisions?: string
  nextTask?: {
    id: string
    title: string
    summary: string
    acceptanceCriteria: string[]
    createdAt: string
  } | null
  checklist?: string[]
}

export async function applyProgressPatch(cwd: string, patch: ProgressPatch): Promise<void> {
  if (patch.status) {
    await writeSectionAtomic(cwd, 'Status', patch.status)
  }
  if (patch.clarifications !== undefined) {
    await writeSectionAtomic(cwd, 'Clarifications', patch.clarifications)
  }
  if (patch.decisions !== undefined) {
    await writeSectionAtomic(cwd, 'Decisions', patch.decisions)
  }
  if (patch.nextTask) {
    const nt = patch.nextTask
    const ac = validateAcceptanceCriteria(nt.acceptanceCriteria)
    const text = `ID: ${nt.id}\nTitle: ${nt.title}\nSummary: ${nt.summary}\nAcceptance Criteria:\n${ac.map((c) => `- ${c}`).join('\n')}\nCreated: ${nt.createdAt}`
    await writeSectionAtomic(cwd, 'Next Task', text)
  }
  if (patch.checklist) {
    const begin = '<!-- CHECKLIST:BEGIN -->'
    const end = '<!-- CHECKLIST:END -->'
    const list = patch.checklist.map((i) => `- [ ] ${i}`).join('\n')
    const block = `${begin}\n${list}\n${end}`
    // update inline checklist if exists, otherwise append Checklist section
    const p = path.join(cwd, PROGRESS)
    let content = ''
    try {
      content = await fs.readFile(p, 'utf8')
    } catch {}
    if (content.includes(begin) && content.includes(end)) {
      content = content.replace(new RegExp(`${begin}[\n\r\s\S]*?${end}`), block)
      await writeFileAtomic(p, content)
    } else {
      await writeSectionAtomic(cwd, 'Checklist', block)
    }
  }
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
  const content = await readProgress(cwd)
  const sections = splitSections(content)
  const next = sections.find((s) => s.heading === 'Next Task')
  if (!next) return null
  const m = next.body.match(/Acceptance Criteria:\n([\s\S]*)/m)
  if (!m) return null
  const block = m[1]
  const lines = block.split('\n').map((l) => l.trim())
  const items: string[] = []
  for (const line of lines) {
    if (line.startsWith('- ')) items.push(line.slice(2).trim())
    else if (line && !line.startsWith('Acceptance Criteria') && !line.startsWith('Created:')) items.push(line)
  }
  return items.length ? items : null
}

import fs from 'fs-extra';
import path from 'path';

export async function readProgress(cwd: string): Promise<string> {
  const p = path.join(cwd, 'progress.md');
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return '';
  }
}

export async function updateStatusInProgress(
  cwd: string,
  status: string,
): Promise<void> {
  const p = path.join(cwd, 'progress.md');
  let content = '';
  try {
    content = await fs.readFile(p, 'utf8');
  } catch {}
  const marker = '## Status';
  if (!content.includes(marker)) {
    content += `\n\n${marker}\n\n${status}\n`;
  } else {
    const parts = content.split(marker);
    const tail = parts[1] ?? '';
    const after = tail.replace(/^[\s\S]*?\n\n(?=## |$)/m, `\n\n${status}\n\n`);
    content = parts[0] + marker + after;
  }
  await fs.writeFile(p, content, 'utf8');
}

export async function setSection(
  cwd: string,
  heading: string,
  body: string,
): Promise<void> {
  const p = path.join(cwd, 'progress.md');
  let content = '';
  try {
    content = await fs.readFile(p, 'utf8');
  } catch {}
  const marker = `## ${heading}`;
  if (!content.includes(marker)) {
    content += `\n\n${marker}\n\n${body}\n`;
  } else {
    const [head, ...rest] = content.split(marker);
    const tail = rest.join(marker);
    const replaced = tail.replace(/^[\s\S]*?\n\n(?=## |$)/m, `\n\n${body}\n\n`);
    content = head + marker + replaced;
  }
  await fs.writeFile(p, content, 'utf8');
}

export async function updateChecklist(
  cwd: string,
  items: string[],
): Promise<void> {
  const p = path.join(cwd, 'progress.md');
  let content = '';
  try {
    content = await fs.readFile(p, 'utf8');
  } catch {}
  const begin = '<!-- CHECKLIST:BEGIN -->';
  const end = '<!-- CHECKLIST:END -->';
  const list = items.map((i) => `- [ ] ${i}`).join('\n');
  const block = `${begin}\n${list}\n${end}`;
  if (content.includes(begin) && content.includes(end)) {
    content = content.replace(new RegExp(`${begin}[\n\r\s\S]*?${end}`), block);
  } else {
    // append a Checklist section if missing
    content += `\n\n## Checklist\n\n${block}\n`;
  }
  await fs.writeFile(p, content, 'utf8');
}

export type ProgressPatch = {
  status?: string;
  clarifications?: string;
  decisions?: string;
  nextTask?: {
    id: string;
    title: string;
    summary: string;
    acceptanceCriteria: string[];
    createdAt: string;
  } | null;
  checklist?: string[];
};

export async function applyProgressPatch(
  cwd: string,
  patch: ProgressPatch,
): Promise<void> {
  if (patch.status) {
    await updateStatusInProgress(cwd, patch.status);
  }
  if (patch.clarifications !== undefined) {
    await setSection(cwd, 'Clarifications', patch.clarifications);
  }
  if (patch.decisions !== undefined) {
    await setSection(cwd, 'Decisions', patch.decisions);
  }
  if (patch.nextTask) {
    const nt = patch.nextTask;
    const text = `ID: ${nt.id}\nTitle: ${nt.title}\nSummary: ${nt.summary}\nAcceptance Criteria:\n${nt.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}\nCreated: ${nt.createdAt}`;
    await setSection(cwd, 'Next Task', text);
  }
  if (patch.checklist) {
    await updateChecklist(cwd, patch.checklist);
  }
}

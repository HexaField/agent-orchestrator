import fs from 'fs-extra';
import path from 'path';

export async function readProgress(cwd: string): Promise<string> {
  const p = path.join(cwd, 'progress.md');
  try { return await fs.readFile(p, 'utf8'); } catch { return ''; }
}

export async function updateStatusInProgress(cwd: string, status: string): Promise<void> {
  const p = path.join(cwd, 'progress.md');
  let content = '';
  try { content = await fs.readFile(p, 'utf8'); } catch {}
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

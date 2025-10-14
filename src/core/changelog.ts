import path from 'path';
import { writeFileAtomic } from '../io/fs';

export async function writeChangelog(cwd: string, task: string, content: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:]/g, '-');
  const rel = path.join('.agent', 'changelogs', `${task}-${ts}.md`);
  const p = path.join(cwd, rel);
  await writeFileAtomic(p, `---\ntask: ${task}\ncreatedAt: ${new Date().toISOString()}\n---\n\n${content}\n`);
  return rel;
}

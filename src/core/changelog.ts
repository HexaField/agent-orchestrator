import path from 'path';
import { writeFileAtomic } from '../io/fs';

export async function writeChangelog(cwd: string, task: string, content: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:]/g, '-');
  const rel = path.join('.agent', 'changelogs', `${task}-${ts}.md`);
  const p = path.join(cwd, rel);
  const lastRunPath = path.join(cwd, '.agent');
  // Simple discovery of latest run.json
  let verification = '';
  try {
    const runsDir = path.join(lastRunPath, 'runs');
    const runs = (await (await import('fs/promises')).readdir(runsDir)).filter((d) => d.startsWith('run-')).sort();
    const last = runs[runs.length - 1];
    if (last) {
      const runJson = JSON.parse(await (await import('fs/promises')).readFile(path.join(runsDir, last, 'run.json'), 'utf8'));
      verification = `\n\n## Verification\n- lint: ${runJson.verification?.lint}\n- typecheck: ${runJson.verification?.typecheck}\n- tests: passed=${runJson.verification?.tests?.passed} failed=${runJson.verification?.tests?.failed}`;
    }
  } catch {}
  await writeFileAtomic(p, `---\ntask: ${task}\ncreatedAt: ${new Date().toISOString()}\n---\n\n${content}${verification}\n`);
  return rel;
}

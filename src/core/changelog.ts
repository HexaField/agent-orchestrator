import path from 'path'
import { writeFileAtomic } from '../io/fs'

export async function writeChangelog(cwd: string, task: string, content: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:]/g, '-')
  const rel = path.join('.agent', 'changelogs', `${task}-${ts}.md`)
  const p = path.join(cwd, rel)
  const lastRunPath = path.join(cwd, '.agent')
  // Simple discovery of latest run.json
  let verification = ''
  try {
    const runsDir = path.join(lastRunPath, 'runs')
    const runs = (await (await import('fs/promises')).readdir(runsDir)).filter((d) => d.startsWith('run-')).sort()
    const last = runs[runs.length - 1]
    if (last) {
      const runJson = JSON.parse(
        await (await import('fs/promises')).readFile(path.join(runsDir, last, 'run.json'), 'utf8')
      )
      verification = `\n\n## Verification\n- lint: ${runJson.verification?.lint}\n- typecheck: ${runJson.verification?.typecheck}\n- tests: passed=${runJson.verification?.tests?.passed} failed=${runJson.verification?.tests?.failed}`
      const gf = runJson.git
      if (gf) {
        const files = (gf.files || [])
          .slice(0, 30)
          .map((f: string) => `- ${f}`)
          .join('\n')
        const diffPreview = gf.diff
          ? '\n\n<details>\n<summary>Diff preview</summary>\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n'
          : ''
        // keep very small diff preview due to size
        const small = gf.diff
          ? String(gf.diff).slice(0, 8000) + (String(gf.diff).length > 8000 ? '\n...(truncated)' : '')
          : ''
        verification += `\n\n## Git changes\n${files}\n\n${diffPreview}\n\n${small}`
      }
    }
  } catch {}
  await writeFileAtomic(
    p,
    `---\ntask: ${task}\ncreatedAt: ${new Date().toISOString()}\n---\n\n${content}${verification}\n`
  )
  return rel
}

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
      const runId = runJson.runId || last
      verification = `\n\n## Run\n- runId: ${runId}\n- startedAt: ${runJson.startedAt}\n\n## Verification\n- lint: ${runJson.verification?.lint}\n- typecheck: ${runJson.verification?.typecheck}\n- tests: passed=${runJson.verification?.tests?.passed} failed=${runJson.verification?.tests?.failed}`
      const gf = runJson.git
      if (gf) {
        const files = (gf.files || []).slice(0, 30)
        const filesList = files.map((f: string) => `- ${f}`).join('\n')
        // Truncate per-file diff preview to avoid huge changelogs
        const maxCharsPerFile = 2000
        let diffPreview = ''
        if (gf.diff) {
          // attempt to split by file chunks if possible, otherwise truncate overall
          const d = String(gf.diff)
          const small = d.length > maxCharsPerFile ? d.slice(0, maxCharsPerFile) + '\n...(truncated)' : d
          diffPreview = `\n\n<details>\n<summary>Diff preview (truncated)</summary>\n\n\n${small}\n\n</details>`
        }
        verification += `\n\n## Git changes\n${filesList}\n${diffPreview}`
      }
    }
  } catch {}
  await writeFileAtomic(
    p,
    `---\ntask: ${task}\nrun: ${process.env.AO_RUN_ID ?? ''}\ncreatedAt: ${new Date().toISOString()}\n---\n\n${content}${verification}\n`
  )
  return rel
}

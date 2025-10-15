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
      // build a compact verification summary
      const testsPassed = runJson.verification?.tests?.passed ?? 0
      const testsFailed = runJson.verification?.tests?.failed ?? 0
      verification = `\n\n## Run\n- runId: ${runId}\n- startedAt: ${runJson.startedAt}\n\n## Verification\n- lint: ${runJson.verification?.lint ?? 'unknown'}\n- typecheck: ${runJson.verification?.typecheck ?? 'unknown'}\n- tests: passed=${testsPassed} failed=${testsFailed}`
      const gf = runJson.git
      if (gf) {
        const files = (gf.files || []).slice(0, 30)
        const filesList = files.map((f: string) => `- ${f}`).join('\n')
        // Truncate per-file diff preview to avoid huge changelogs
        const maxTotalChars = 8000
        const maxPerFile = 1500
        let diffPreview = ''
        if (gf.diff) {
          const d = String(gf.diff)
          // Attempt to keep per-file chunks when possible
          let preview = d
          if (d.length > maxTotalChars) preview = d.slice(0, maxTotalChars) + '\n\n...(truncated)'
          // further truncate very long file hunks
          if (preview.length > maxPerFile) preview = preview.slice(0, maxPerFile) + '\n\n...(truncated)'
          diffPreview = `\n\n<details>\n<summary>Diff preview (truncated)</summary>\n\n${preview}\n\n</details>`
        }
        verification += `\n\n## Git changes\n${filesList}\n${diffPreview}`
      }
    }
  } catch {}
  // use RUN_ID from project config when present
  let runIdHeader = ''
  try {
    const { readProjectConfig } = await import('../config')
    const cfg = await readProjectConfig(process.cwd())
    if (cfg && (cfg as any).RUN_ID) runIdHeader = (cfg as any).RUN_ID
  } catch {}
  const header = `---\nformat: agent-orchestrator-v1\ntask: ${task}\nrun: ${runIdHeader}\ncreatedAt: ${new Date().toISOString()}\n---\n\n`
  await writeFileAtomic(p, `${header}${content}${verification}\n`)
  return rel
}

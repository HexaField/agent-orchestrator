import { Command } from 'commander'
import { promises as fs } from 'fs'
import path from 'path'
import { ensureProjectConfig } from '../../config'
import { setState } from '../../core/orchestrator'
import { genChecklist } from '../../core/templates'
import { ensureDir } from '../../io/fs'

const init = new Command('init')
  .description('Initialize .agent/ and progress.md, derive initial checklist from spec.md')
  .option('--cwd <path>', 'Working directory', '.')
  .action(async (opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    const agentDir = path.join(cwd, '.agent')
    await ensureDir(agentDir)
    await ensureDir(path.join(agentDir, 'runs'))
    await ensureDir(path.join(agentDir, 'changelogs'))

    const specPath = path.join(cwd, 'spec.md')
    let spec = ''
    try {
      spec = await fs.readFile(specPath, 'utf8')
    } catch {}

    const checklist = genChecklist(spec)

    const progressPath = path.join(cwd, 'progress.md')
    const progressContent = `# Progress\n\n## Context\n\n\n## Clarifications\n\n\n## Checklist\n\n<!-- CHECKLIST:BEGIN -->\n${checklist.map((i) => `- [ ] ${i}`).join('\n')}\n<!-- CHECKLIST:END -->\n\n## Decisions\n\n\n## Status\n\ninitialized\n\n## Next Task\n\n`
    await fs.writeFile(progressPath, progressContent, 'utf8')

    await setState(cwd, {
      version: 1,
      currentRunId: null,
      status: 'idle',
      lastOutcome: 'none',
      nextTask: null
    } as any)

    // Ensure project config is created/seeded
    try {
      await ensureProjectConfig(cwd)
    } catch {
      // non-fatal: if config can't be written, continue with defaults
    }

    // audit log file
    await fs.appendFile(path.join(agentDir, 'audit.log'), '', 'utf8')
  })

export default init

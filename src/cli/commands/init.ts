import { Command } from 'commander'
import { promises as fs } from 'fs'
import path from 'path'
import { ensureProjectConfig } from '../../config'
import { setState } from '../../core/orchestrator'
import { seedTemplates } from '../../core/templateLoader'
import { genChecklist } from '../../core/templates'
import { ensureDir } from '../../io/fs'

const init = new Command('init')
  .description('Initialize .agent/ and progress.json, derive initial checklist from spec.md')
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
    const progressPath = path.join(cwd, 'progress.json')
    const progressDoc = {
      context: '',
      clarifications: '',
      checklist: checklist.map((c) => ({ done: false, description: c })),
      decisions: '',
      status: 'initialized',
      nextTask: null
    }
    await fs.writeFile(progressPath, JSON.stringify(progressDoc, null, 2), 'utf8')

    console.log(`Initialized .agent/ and progress.json in ${cwd}`)

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

    // Seed default templates into .agent/templates (will not overwrite existing files)
    try {
      await seedTemplates(cwd)
    } catch {
      // ignore template seed failures
    }

    console.log('Created default config and seeded templates in .agent/')
  })

export default init

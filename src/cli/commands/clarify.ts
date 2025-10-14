import { Command } from 'commander'
import path from 'path'
import { setState } from '../../core/orchestrator'
import { applyProgressPatch, readProgress } from '../../core/progress'
import { genClarifyAsync } from '../../core/templates'

const clarify = new Command('clarify')
  .description('Generate or apply clarifications to progress.md')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--text <text>', 'Clarification text to apply (if provided)')
  .option('--approve', 'After applying clarifications, mark awaiting approval', false)
  .action(async (opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    if (opts.text) {
      await applyProgressPatch(cwd, { clarifications: opts.text })
      if (opts.approve) await setState(cwd, { status: 'awaiting_approval' } as any)
      else await setState(cwd, { status: 'idle' } as any)
      process.stdout.write('clarifications applied\n')
      return
    }

    // generate clarifying questions based on spec/progress
    const progress = await readProgress(cwd)
    const clar = await genClarifyAsync(progress)
    await applyProgressPatch(cwd, { clarifications: clar })
    process.stdout.write('clarifications written\n')
  })

export default clarify

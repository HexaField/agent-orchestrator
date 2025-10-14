import { Command } from 'commander'
import path from 'path'
import { applyProgressPatch } from '../../core/progress'
import { setState } from '../../core/orchestrator'

const clarify = new Command('clarify')
  .description('Apply clarification answers to progress.md and resume flow')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--text <text>', 'Clarification text to apply')
  .option('--approve', 'After applying clarifications, mark awaiting approval', false)
  .action(async (opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    const text = opts.text ?? ''
    await applyProgressPatch(cwd, { clarifications: text })
    if (opts.approve) {
      await setState(cwd, { status: 'awaiting_approval' } as any)
    } else {
      await setState(cwd, { status: 'idle' } as any)
    }
  })

export default clarify

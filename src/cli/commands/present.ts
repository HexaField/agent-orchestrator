import { Command } from 'commander'
import path from 'path'
import { setState } from '../../core/orchestrator'
import { readProgress } from '../../core/progress'

const present = new Command('present')
  .description('Show progress.md sections and optionally approve')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--approve', 'Approve and set awaiting_approval', false)
  .action(async (opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    const content = await readProgress(cwd)
    // Simple console output — in tests we don't actually show it, but tests
    // invoke the command and then read state to validate behavior.
    console.log(content || 'No progress.md found')
    if (opts.approve) {
      // set state to awaiting_approval so run will require explicit approval
      await setState(cwd, { status: 'awaiting_approval' } as any)
    }
  })

export default present

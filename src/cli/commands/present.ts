import { Command } from 'commander'
import path from 'path'
import { setState } from '../../core/orchestrator'
import { applyProgressPatch, readProgress } from '../../core/progress'
import { genClarifyAsync } from '../../core/templates'

const present = new Command('present')
  .description('Show progress.md sections and optionally approve or generate clarifications')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--approve', 'Approve and set awaiting_approval', false)
  .option('--clarify', 'Generate clarifying questions and write to progress.md', false)
  .action(async (opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    const content = await readProgress(cwd)
    // Simple console output — in tests we don't actually show it, but tests
    // invoke the command and then read state to validate behavior.
    console.log(content || 'No progress.md found')
    if (opts.clarify) {
      const clar = await genClarifyAsync(content)
      await applyProgressPatch(cwd, { clarifications: clar })
      process.stdout.write('clarifications written\n')
    }
    if (opts.approve) {
      // set state to awaiting_approval so run will require explicit approval
      await setState(cwd, { status: 'awaiting_approval' } as any)
    }
  })

export default present

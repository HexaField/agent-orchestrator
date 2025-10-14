import { Command } from 'commander'
import path from 'path'
import { readJsonSafe } from '../../io/fs'

const status = new Command('status')
  .description('Print current orchestrator status and last run summary')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--json', 'Output JSON', false)
  .action(async (opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    const state: any = await readJsonSafe(path.join(cwd, '.agent', 'state.json'), {} as any)
    if (opts.json) {
      process.stdout.write(JSON.stringify(state, null, 2) + '\n')
    } else {
      process.stdout.write(`status: ${state.status ?? 'unknown'}\n`)
    }
  })

export default status

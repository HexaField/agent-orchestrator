import { Command } from 'commander'
import fs from 'fs-extra'
import path from 'path'

const showRun = new Command('show-run')
  .description('Show .agent run metadata for a given run id')
  .argument('<runId>', 'Run ID')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--json', 'Output JSON', false)
  .action(async (runId: string, opts: any) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    const p = path.join(cwd, '.agent', 'runs', runId, 'run.json')
    const exists = await fs.pathExists(p)
    if (!exists) {
      console.error('run not found')
      process.exitCode = 2
      return
    }
    const data = await fs.readJson(p)
    if (opts.json) console.log(JSON.stringify(data, null, 2))
    else console.log(data)
  })

export default showRun

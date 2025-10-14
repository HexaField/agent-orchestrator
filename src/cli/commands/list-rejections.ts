import { Command } from 'commander'
import path from 'path'
import fs from 'fs-extra'

const listRejections = new Command('list-rejections')
  .description('List preserved .rej (patch rejection) files for a given run')
  .argument('<runId>', 'Run ID')
  .option('--cwd <path>', 'Working directory', '.')
  .action(async (runId: string, opts: any) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    const dir = path.join(cwd, '.agent', 'runs', runId, 'rejections')
    const exists = await fs.pathExists(dir)
    if (!exists) {
      console.error('no rejections found for run')
      process.exitCode = 2
      return
    }
    const files = await fs.readdir(dir)
    for (const f of files) console.log(f)
  })

export default listRejections

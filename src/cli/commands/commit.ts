import { Command } from 'commander'
import { execa } from 'execa'
import path from 'path'
import { writeChangelog } from '../../core/changelog'
import { getState, setState } from '../../core/orchestrator'

const commit = new Command('commit')
  .description('Generate changelog, commit changes, and optionally open PR')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--branch <name>', 'Branch name')
  .option('--no-pr', 'Do not open a PR')
  .action(async (opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    const state = await getState(cwd)
    if (state.status !== 'ready_to_commit') {
      throw new Error(`Cannot commit: status is ${state.status}, require ready_to_commit`)
    }
    const rel = await writeChangelog(cwd, opts.branch ?? 'task', 'Automated changelog')
    // Attempt a simple commit if in a git repo
    try {
      await execa('git', ['add', '-A'], { cwd })
      const branch = opts.branch ?? `agent/${Date.now()}`
      await execa('git', ['checkout', '-b', branch], { cwd, reject: false })
      await execa('git', ['commit', '-m', `feat(agent): implement ${branch}`], {
        cwd,
        reject: false
      })
    } catch {
      // ignore if git not present
    }
    await setState(cwd, { status: 'idle' } as any)
    process.stdout.write(`changelog: ${rel}\n`)
  })

export default commit

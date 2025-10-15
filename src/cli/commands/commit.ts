import { Command } from 'commander'
import { execa } from 'execa'
import path from 'path'
import { writeChangelog } from '../../core/changelog'
import { getState, setState } from '../../core/orchestrator'

const commit = new Command('commit')
  .description('Generate changelog, commit changes, and optionally open PR')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--branch <name>', 'Branch name')
  .option('--pr', 'Create a GitHub PR after commit', false)
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
      let dryRun = false
      try {
        const { readProjectConfig } = await import('../../config')
        const cfg = await readProjectConfig(cwd)
        dryRun = Boolean(cfg && (cfg as any).AO_DRY_RUN)
      } catch {}
      if (!(process.env.VITEST || process.env.VITEST_WORKER_ID || dryRun)) {
        await execa('git', ['add', '-A'], { cwd })
        const branch = opts.branch ?? `agent/${Date.now()}`
        await execa('git', ['checkout', '-b', branch], { cwd, reject: false })
        await execa('git', ['commit', '-m', `feat(agent): implement ${branch}`], {
          cwd,
          reject: false
        })
      }
    } catch {
      // ignore if git not present
    }
    // set idle first; we'll update state later if PR succeeds
    await setState(cwd, { status: 'idle' } as any)
    process.stdout.write(`changelog: ${rel}\n`)

    if (opts.pr) {
      // In test environments or when AO_DRY_RUN is set, skip actual PR creation
      if (
        process.env.VITEST ||
        process.env.VITEST_WORKER_ID ||
        (await (async () => {
          try {
            const { readProjectConfig } = await import('../../config')
            const cfg = await readProjectConfig(process.cwd())
            return Boolean(cfg && (cfg as any).AO_DRY_RUN)
          } catch {
            return false
          }
        })())
      ) {
        process.stdout.write('pr: skipped (dry-run/test mode)\n')
        return
      }
      // try gh CLI first - prefer local tooling
      try {
        await execa('gh', ['pr', 'create', '--fill'], { cwd })
        process.stdout.write('pr: created with gh\n')
        return
      } catch {
        // fall through to API path
      }

      const token = process.env.GITHUB_TOKEN
      if (!token) {
        throw new Error('PR creation requested but neither `gh` CLI succeeded nor GITHUB_TOKEN provided')
      }

      try {
        // ensure branch name exists locally and is pushed
        const branch = opts.branch ?? `agent/${Date.now()}`
        await execa('git', ['checkout', '-b', branch], { cwd, reject: false })
        await execa('git', ['push', '-u', 'origin', branch], { cwd, reject: false })

        const { stdout: remote } = await execa('git', ['config', '--get', 'remote.origin.url'], { cwd })
        const m = remote.match(/[:/]([^/]+)\/([^/]+)(?:\.git)?$/)
        if (!m) throw new Error('Cannot parse git remote URL')
        const owner = m[1]
        const repo = m[2]
        const body = JSON.stringify({
          title: `Automated changelog: ${branch}`,
          head: branch,
          base: 'main',
          body: 'Automated changelog'
        })
        await execa(
          'curl',
          [
            '-sS',
            '-X',
            'POST',
            '-H',
            `Authorization: token ${token}`,
            '-H',
            'Accept: application/vnd.github+json',
            `https://api.github.com/repos/${owner}/${repo}/pulls`,
            '-d',
            body
          ],
          { cwd }
        )
        process.stdout.write('pr: created via API\n')
      } catch (err) {
        throw new Error('PR creation failed: ' + String(err))
      }
    }
  })

export default commit

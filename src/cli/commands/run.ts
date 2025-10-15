import { Command } from 'commander'
import path from 'path'
import { getEffectiveConfig } from '../../config'
import { runOnce } from '../../core/orchestrator'

const run = new Command('run')
  .description('Run an agent iteration with current configuration')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--non-interactive', 'Non-interactive mode', false)
  .option('--force', 'Force run even if awaiting human approval', false)
  .option('--llm <name>', 'LLM adapter name')
  .option('--agent <name>', 'Agent adapter name')
  .option('--prompt <text>', 'Initial agent prompt')
  .option('--apply-patches', 'Apply patches emitted by the agent when responseType=patches', false)
  .action(async (opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    const cfg = await getEffectiveConfig(cwd)
    await runOnce(cwd, {
      llm: opts.llm ?? cfg.LLM_PROVIDER,
      endpoint: opts.endpoint ?? cfg.LLM_ENDPOINT,
      model: opts.model ?? cfg.LLM_MODEL,
      agent: opts.agent ?? cfg.AGENT,
      prompt: opts.prompt,
      force: Boolean(opts.force),
      nonInteractive: Boolean(opts.nonInteractive)
    })
    if (opts.applyPatches) {
      try {
        const { applyPatchesFromRun } = await import('../../core/patches')
        // read state to get current run id
        const { getState } = await import('../../core/orchestrator')
        const st = await getState(cwd)
        if (st.currentRunId) {
          const res = await applyPatchesFromRun(cwd, st.currentRunId)
          if (!res.applied) {
            // in non-test runs, warn the user

            console.warn('Patches were not applied:', res.path)
          }
        }
      } catch {
        // ignore failures to apply patches
      }
    }
  })

export default run

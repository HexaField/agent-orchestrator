import { Command } from 'commander'
import path from 'path'
import { loadConfig } from '../../config/defaults'
import { runOnce } from '../../core/orchestrator'

const run = new Command('run')
  .description('Run an agent iteration with current configuration')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--non-interactive', 'Non-interactive mode', false)
  .option('--force', 'Force run even if awaiting human approval', false)
  .option('--llm <name>', 'LLM adapter name')
  .option('--agent <name>', 'Agent adapter name')
  .option('--prompt <text>', 'Initial agent prompt')
  .action(async (opts) => {
    const cfg = loadConfig()
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    await runOnce(cwd, {
      llm: opts.llm ?? cfg.LLM_PROVIDER,
      endpoint: cfg.LLM_ENDPOINT,
      model: cfg.LLM_MODEL,
      agent: opts.agent ?? cfg.AGENT,
      prompt: opts.prompt,
      force: Boolean(opts.force),
      nonInteractive: Boolean(opts.nonInteractive)
    })
  })

export default run

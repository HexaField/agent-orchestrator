import { Command } from 'commander'
import path from 'path'
import { setState } from '../../core/orchestrator'
import { applyProgressPatch, writeSectionAtomic } from '../../core/progress'

const review = new Command('review')
  .description('Review code changes and gate the flow')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--approve', 'Approve the changes', false)
  .option('--request-changes', 'Request changes', false)
  .action(async (opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    if (opts.approve) {
      await setState(cwd, { status: 'ready_to_commit' } as any)
    } else if (opts.requestChanges || opts.requestChanges === true) {
      // synthesize recommended changes and write to progress.md and state
      try {
        let rec
        let useLLM = false
        try {
          const { readProjectConfig } = await import('../../config')
          const cfg = await readProjectConfig(cwd)
          if (cfg && (cfg as any).USE_LLM_GEN) useLLM = true
        } catch {}
        if (useLLM) {
          const { genChangeAsync } = await import('../../core/templates')
          rec = await genChangeAsync(undefined, 'review')
        } else {
          const { genChange } = await import('../../core/templates')
          rec = genChange()
        }
        const body = `ID: ${rec.id}\nTitle: ${rec.title}\nSummary: ${rec.summary}\nAcceptance Criteria:\n${rec.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}\nCreated: ${rec.createdAt}`
        await applyProgressPatch(cwd, { decisions: undefined })
        await applyProgressPatch(cwd, { nextTask: rec })
        await writeSectionAtomic(cwd, 'Recommendations', body)
        await setState(cwd, { status: 'changes_requested', nextTask: rec } as any)
      } catch {
        // ignore write failures
        await setState(cwd, { status: 'changes_requested' } as any)
      }
    }
  })

export default review

import { Command } from 'commander';
import path from 'path';
import { setState } from '../../core/orchestrator';

const review = new Command('review')
  .description('Review code changes and gate the flow')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--approve', 'Approve the changes', false)
  .option('--request-changes', 'Request changes', false)
  .action(async (opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.');
    if (opts.approve) {
      await setState(cwd, { status: 'ready_to_commit' } as any);
    } else if (opts.requestChanges) {
      await setState(cwd, { status: 'changes_requested' } as any);
    }
  });

export default review;

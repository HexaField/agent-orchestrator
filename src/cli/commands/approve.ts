import { Command } from 'commander';
import path from 'path';
import { setState } from '../../core/orchestrator';

const approve = new Command('approve')
  .description('Mark human approval to proceed with agent run')
  .option('--cwd <path>', 'Working directory', '.')
  .action(async (opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.');
    await setState(cwd, { status: 'awaiting_approval' } as any);
  });

export default approve;

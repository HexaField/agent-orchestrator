import { Command } from 'commander';
import initCmd from './commands/init.js';
import runCmd from './commands/run.js';
import approveCmd from './commands/approve.js';
import reviewCmd from './commands/review.js';
import statusCmd from './commands/status.js';
import commitCmd from './commands/commit.js';

const program = new Command();
program
  .name('agent-orchestrator')
  .description('Spec-driven coding-agent orchestrator CLI')
  .version('0.1.0');

program.addCommand(initCmd);
program.addCommand(runCmd);
program.addCommand(approveCmd);
program.addCommand(reviewCmd);
program.addCommand(statusCmd);
program.addCommand(commitCmd);

program.parseAsync(process.argv);

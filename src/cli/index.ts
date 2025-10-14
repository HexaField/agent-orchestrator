import { Command } from 'commander';
import initCmd from './commands/init';
import runCmd from './commands/run';
import approveCmd from './commands/approve';
import reviewCmd from './commands/review';
import statusCmd from './commands/status';
import commitCmd from './commands/commit';

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

import { Command } from 'commander'
import approveCmd from './commands/approve'
import commitCmd from './commands/commit'
import initCmd from './commands/init'
import reviewCmd from './commands/review'
import runCmd from './commands/run'
import statusCmd from './commands/status'

const program = new Command()
program.name('agent-orchestrator').description('Spec-driven coding-agent orchestrator CLI').version('0.1.0')

program.addCommand(initCmd)
program.addCommand(runCmd)
program.addCommand(approveCmd)
program.addCommand(reviewCmd)
program.addCommand(statusCmd)
program.addCommand(commitCmd)

program.parseAsync(process.argv)

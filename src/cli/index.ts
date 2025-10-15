import { Command } from 'commander'
import approveCmd from './commands/approve'
import clarifyCmd from './commands/clarify'
import commitCmd from './commands/commit'
import initCmd from './commands/init'
import listRejectionsCmd from './commands/list-rejections'
import presentCmd from './commands/present'
import reviewCmd from './commands/review'
import runCmd from './commands/run'
import showRunCmd from './commands/show-run'
import statusCmd from './commands/status'

const program = new Command()
program.name('agent-orchestrator').description('Spec-driven coding-agent orchestrator CLI').version('0.1.0')

program.addCommand(initCmd)
program.addCommand(runCmd)
program.addCommand(approveCmd)
program.addCommand(reviewCmd)
program.addCommand(statusCmd)
program.addCommand(commitCmd)
program.addCommand(presentCmd)
program.addCommand(clarifyCmd)
program.addCommand(showRunCmd)
program.addCommand(listRejectionsCmd)

program.parseAsync(process.argv)

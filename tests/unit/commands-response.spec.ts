import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runOnce } from '../../src/core/orchestrator'
import { seedConfigFor } from '../support/seedConfig'

describe('responseType commands', () => {
  const tmp = path.join(__dirname, '.tmp-cmds')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent', 'runs'))
    await fs.writeFile(path.join(tmp, 'spec.md'), '# Spec')
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('runs commands when AO_ALLOW_COMMANDS=1', async () => {
    await seedConfigFor(tmp, { ALLOW_COMMANDS: '1' })
    // use a harmless echo command; custom agent will echo prompt
    const cmd = 'echo hello-from-agent'
    await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: cmd })
    // when commands are run, commandsRun is internal; instead assert process side-effect
    // write a file via the command to observe it
    // run a command that creates a file
    const touchCmd = `node -e "require('fs').writeFileSync('cmd-output.txt','ok')"`
    await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: touchCmd })
    expect(await fs.pathExists(path.join(tmp, 'cmd-output.txt'))).toBe(true)
    // cleanup: remove project config by deleting tmp
  })
})

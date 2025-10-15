import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import initCmd from '../../src/cli/commands/init'

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ao-e2e-'))
}

describe('cli init', () => {
  it('creates .agent/templates and progress.md and state.json', async () => {
    const tmp = makeTmpDir()
    // run init command with cwd
    await initCmd.parseAsync(['node', 'init', '--cwd', tmp])

    const agentDir = path.join(tmp, '.agent')
    expect(fs.existsSync(agentDir)).toBe(true)

    const templatesDir = path.join(agentDir, 'templates')
    expect(fs.existsSync(templatesDir)).toBe(true)
    expect(fs.existsSync(path.join(templatesDir, 'context.md'))).toBe(true)

    const progress = path.join(tmp, 'progress.md')
    expect(fs.existsSync(progress)).toBe(true)
    const progressText = fs.readFileSync(progress, 'utf8')
    expect(progressText).toContain('# Progress')

    const state = path.join(agentDir, 'state.json')
    expect(fs.existsSync(state)).toBe(true)
    const stateJson = JSON.parse(fs.readFileSync(state, 'utf8'))
    expect(stateJson.status).toBe('idle')
  })
})

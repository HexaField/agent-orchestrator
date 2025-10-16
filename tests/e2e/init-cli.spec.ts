import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import initCmd from '../../src/cli/commands/init'
import specToProgressCmd from '../../src/cli/commands/spec-to-progress'

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ao-e2e-'))
}

describe('cli init', () => {
  it('creates .agent/templates and progress.json and state.json', async () => {
    const tmp = makeTmpDir()
    // run init command with cwd
    await initCmd.parseAsync(['node', 'init', '--cwd', tmp])

    const agentDir = path.join(tmp, '.agent')
    expect(fs.existsSync(agentDir)).toBe(true)

    const templatesDir = path.join(agentDir, 'templates')
    expect(fs.existsSync(templatesDir)).toBe(true)
    expect(fs.existsSync(path.join(templatesDir, 'context.md'))).toBe(true)

    const progress = path.join(tmp, 'progress.json')
    expect(fs.existsSync(progress)).toBe(true)
    const progressText = fs.readFileSync(progress, 'utf8')
    const doc = JSON.parse(progressText)
    expect(Array.isArray(doc.checklist)).toBe(true)

    // Now run the new spec-to-progress command (dry run false) to ensure it applies
    await specToProgressCmd.parseAsync(['node', 'spec-to-progress', '--cwd', tmp])

    const progressAfter = fs.readFileSync(progress, 'utf8')
    expect(/awaiting_review|needs_clarification|idle|changes_requested/i.test(progressAfter)).toBe(true)

    const state = path.join(agentDir, 'state.json')
    expect(fs.existsSync(state)).toBe(true)
    const stateJson = JSON.parse(fs.readFileSync(state, 'utf8'))
    expect(stateJson.status).toBe('idle')
  })
})

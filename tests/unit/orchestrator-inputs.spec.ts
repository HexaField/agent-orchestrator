import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runOnce } from '../../src/core/orchestrator'
import { seedConfigFor } from '../support/seedConfig'

describe('run inputs recorded', () => {
  const tmp = path.join(__dirname, '.tmp-inputs')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
  })
  afterEach(async () => {
    await fs.remove(tmp)
  })

  it('records checklist, contextPrompts, responseType and llmPrompt in run.json', async () => {
  await seedConfigFor(tmp, { SKIP_VERIFY: '1' })
    const res = await runOnce(tmp, { llm: 'passthrough', agent: 'custom', prompt: 'implement spec', force: true })
    expect(res).toHaveProperty('runId')
    const runPath = path.join(tmp, '.agent', 'runs', res.runId, 'run.json')
    const runJson = JSON.parse(await fs.readFile(runPath, 'utf8'))
    expect(runJson.inputs).toBeDefined()
    expect(Array.isArray(runJson.inputs.checklist)).toBe(true)
    expect(Array.isArray(runJson.inputs.contextPrompts)).toBe(true)
    expect(typeof runJson.inputs.responseType).toBe('string')
    expect(typeof runJson.inputs.llmPrompt).toBe('string')
  })
})

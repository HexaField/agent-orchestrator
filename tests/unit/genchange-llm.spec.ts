import fs from 'fs-extra'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as gc from '../../src/core/generatorClient'
import { genChangeAsync } from '../../src/core/templates'
import { seedConfigFor } from '../support/seedConfig'

// Monkey-patch the callLLM pathway by stubbing genChangeLLM to return controlled outputs.

describe('genChangeAsync (LLM-backed)', () => {
  const tmp = path.join(__dirname, '.tmp-genchange')
  beforeEach(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
    await seedConfigFor(tmp, { USE_LLM_GEN: '1', LLM_PROVIDER: 'passthrough' })
    // change cwd for template call which uses process.cwd() when reading .agent
    process.chdir(tmp)
  })
  afterEach(async () => {
    try {
      // restore cwd to repo root for subsequent tests
      process.chdir(path.resolve(__dirname, '..', '..'))
    } catch {}
    await fs.remove(tmp)
  })

  it('parses valid JSON returned by LLM', async () => {
    const json = JSON.stringify({
      title: 'Fix tests',
      summary: 'Update assertions',
      acceptanceCriteria: ['All tests pass']
    })
    vi.spyOn(gc, 'genChangeLLM').mockResolvedValue(json)

    const task = await genChangeAsync('# spec', 'reason')
    expect(task.title).toBe('Fix tests')
    expect(task.summary).toBe('Update assertions')
    expect(Array.isArray(task.acceptanceCriteria)).toBe(true)
  })

  it('falls back when LLM returns invalid JSON', async () => {
    vi.spyOn(gc, 'genChangeLLM').mockResolvedValue('I could not produce JSON, sorry')
    const task = await genChangeAsync('# spec', 'reason')
    // deterministic fallback uses 'Changes requested: <reason>' when a reason is provided
    expect(task.title).toContain('Changes requested')
    expect(task.summary).toContain('LLM output could not be parsed as JSON')
  })
})

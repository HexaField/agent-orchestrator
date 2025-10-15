import fs from 'fs-extra'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { getEffectiveConfig } from '../../src/config'
import { loadConfig } from '../../src/config/defaults'
import { seedConfigFor } from '../support/seedConfig'

describe('config behavior', () => {
  it('loadConfig non-strict falls back to defaults on invalid env', () => {
    const env = { LLM_ENDPOINT: 'not-a-url' }
    const cfg = loadConfig(env)
    expect(cfg.LLM_ENDPOINT).toBeUndefined()
    expect(cfg.LLM_PROVIDER).toBeDefined()
  })

  it('loadConfig strict throws on invalid env', () => {
    const env = { LLM_ENDPOINT: 'not-a-url' }
    expect(() => loadConfig(env, { strict: true })).toThrow()
  })

  it('getEffectiveConfig prefers project config over env', async () => {
    const tmp = path.join(__dirname, '.tmp-config')
    await fs.remove(tmp)
    await fs.ensureDir(tmp)
    await fs.ensureDir(path.join(tmp, '.agent'))
    try {
      await seedConfigFor(tmp, { LLM_PROVIDER: 'project-llm', RESPONSE_TYPE: 'files' })
      const env = { LLM_PROVIDER: 'env-llm', LLM_ENDPOINT: 'http://example.com' }
      const cfg = await getEffectiveConfig(tmp, env as any)
      expect(cfg.LLM_PROVIDER).toBe('project-llm')
      // Precedence: project config overrides env -> expect project endpoint
      expect(cfg.LLM_ENDPOINT).toBe('http://localhost:11434/v1')
      expect(cfg.RESPONSE_TYPE).toBe('files')
    } finally {
      await fs.remove(tmp)
    }
  })
})

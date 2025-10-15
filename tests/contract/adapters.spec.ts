import fs from 'fs-extra'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAgentAdapter } from '../../src/adapters/agent'
import { getLLMAdapter } from '../../src/adapters/llm'

describe('adapter contracts', () => {
  it('passthrough LLM returns the prompt as text', async () => {
    const llm = getLLMAdapter('passthrough', {})
    expect(llm).toHaveProperty('name')
    const out = await llm.generate({ prompt: 'hello world' })
    expect(out).toHaveProperty('text')
    expect(out.text).toBe('hello world')
  })

  it('agent-replay adapter returns run artifacts when run', async () => {
    const agent = getAgentAdapter('agent-replay')
    const tmp = path.join(process.cwd(), '.agent-test-' + Date.now())
    await fs.ensureDir(tmp)
    try {
      const res = await agent.run({ prompt: 'noop', cwd: tmp })
      // replay adapter returns stdout/stderr keys as strings
      expect(res).toHaveProperty('stdout')
      expect(typeof res.stdout).toBe('string')
    } finally {
      try {
        await fs.remove(tmp)
      } catch {}
    }
  })
})

import { createCodexCli } from '../../src/adapters/agent/codexCli'
import { createVllm } from '../../src/adapters/llm/vllm'
import * as shell from '../../src/io/shell'

describe('adapters contracts (cli/http)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('agent adapter executes CLI and propagates result', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    const res = await agent.run({ prompt: 'do x', cwd: process.cwd() })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('ok')
    expect(spy).toHaveBeenCalled()
  })

  it('llm adapter returns text and handles http', async () => {
    const originalFetch = globalThis.fetch
    // @ts-ignore - mock fetch
    globalThis.fetch = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'hello' } }] })
      } as any
    }) as any
    const llm = createVllm({})
    const out = await llm.generate({ prompt: 'hi' })
    expect(out.text).toBe('hello')
    globalThis.fetch = originalFetch
  })
})

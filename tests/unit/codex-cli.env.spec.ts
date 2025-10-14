import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCodexCli } from '../../src/adapters/agent/codexCli'
import * as shell from '../../src/io/shell'

describe('codex-cli env mapping', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sets OPENAI_API_BASE from CODEX_API_BASE', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    await agent.run({ prompt: 'x', cwd: process.cwd(), env: { CODEX_API_BASE: 'http://localhost:9000/v1' } as any })
    expect(spy).toHaveBeenCalled()
    const calledEnv = (spy.mock.calls[0][2] as any).env
    expect(calledEnv.OPENAI_API_BASE).toBe('http://localhost:9000/v1')
  })

  it('falls back to VLLM_SERVER_URL', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    await agent.run({ prompt: 'x', cwd: process.cwd(), env: { VLLM_SERVER_URL: 'http://localhost:8000/v1' } as any })
    const calledEnv = (spy.mock.calls[0][2] as any).env
    expect(calledEnv.OPENAI_API_BASE).toBe('http://localhost:8000/v1')
  })

  it('falls back to LLM_ENDPOINT', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    await agent.run({ prompt: 'x', cwd: process.cwd(), env: { LLM_ENDPOINT: 'http://127.0.0.1:7000/v1' } as any })
    const calledEnv = (spy.mock.calls[0][2] as any).env
    expect(calledEnv.OPENAI_API_BASE).toBe('http://127.0.0.1:7000/v1')
  })

  it('preserves other env variables and does not overwrite when none present', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    await agent.run({ prompt: 'x', cwd: process.cwd(), env: { FOO: 'bar' } as any })
    const calledEnv = (spy.mock.calls[0][2] as any).env
    expect(calledEnv.FOO).toBe('bar')
    expect(calledEnv.OPENAI_API_BASE).toBeUndefined()
  })
})

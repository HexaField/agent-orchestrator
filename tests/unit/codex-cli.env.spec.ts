import { mkdtempSync } from 'fs'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodexCli } from '../../src/adapters/agent/codexCli'
import * as shell from '../../src/io/shell'

describe('codex-cli env mapping', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // Use a temp cwd to avoid picking up repository .agent/config.json during tests
  const tmpCwd = mkdtempSync(path.join(os.tmpdir(), 'ao-codex-'))

  it('sets OPENAI_API_BASE from CODEX_API_BASE', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    await agent.run({ prompt: 'x', cwd: tmpCwd, env: { CODEX_API_BASE: 'http://localhost:9000/v1' } as any })
    expect(spy).toHaveBeenCalled()
    const calledEnv = (spy.mock.calls[0][2] as any).env
    expect(calledEnv.OPENAI_API_BASE).toBe('http://localhost:9000/v1')
  })

  it('falls back to VLLM_SERVER_URL', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    await agent.run({ prompt: 'x', cwd: tmpCwd, env: { VLLM_SERVER_URL: 'http://localhost:8000/v1' } as any })
    const calledEnv = (spy.mock.calls[0][2] as any).env
    expect(calledEnv.OPENAI_API_BASE).toBe('http://localhost:8000/v1')
  })

  it('falls back to LLM_ENDPOINT', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    await agent.run({ prompt: 'x', cwd: tmpCwd, env: { LLM_ENDPOINT: 'http://127.0.0.1:7000/v1' } as any })
    const calledEnv = (spy.mock.calls[0][2] as any).env
    expect(calledEnv.OPENAI_API_BASE).toBe('http://127.0.0.1:7000/v1')
  })

  it('preserves other env variables and does not overwrite when none present', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    await agent.run({ prompt: 'x', cwd: tmpCwd, env: { FOO: 'bar' } as any })
    const calledEnv = (spy.mock.calls[0][2] as any).env
    expect(calledEnv.FOO).toBe('bar')
    expect(calledEnv.OPENAI_API_BASE).toBeUndefined()
  })

  it('falls back to OLLAMA_SERVER_URL', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    await agent.run({ prompt: 'x', cwd: tmpCwd, env: { OLLAMA_SERVER_URL: 'http://localhost:11434' } as any })
    const calledEnv = (spy.mock.calls[0][2] as any).env
    expect(calledEnv.OPENAI_API_BASE).toBe('http://localhost:11434')
  })
})

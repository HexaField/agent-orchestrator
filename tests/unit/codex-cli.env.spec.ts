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

  it('sets LLM_ENDPOINT when provided via env', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    await agent.run({ prompt: 'x', cwd: tmpCwd, env: { LLM_ENDPOINT: 'http://localhost:9000/v1' } as any })
    expect(spy).toHaveBeenCalled()
    const calledEnv = (spy.mock.calls[0][2] as any).env
    expect(calledEnv.LLM_ENDPOINT).toBe('http://localhost:9000/v1')
  })

  it('uses LLM_ENDPOINT when provided', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    await agent.run({ prompt: 'x', cwd: tmpCwd, env: { LLM_ENDPOINT: 'http://127.0.0.1:7000/v1' } as any })
    const calledEnv = (spy.mock.calls[0][2] as any).env
    expect(calledEnv.LLM_ENDPOINT).toBe('http://127.0.0.1:7000/v1')
  })

  it('preserves other env variables and does not overwrite when none present', async () => {
    const spy = vi.spyOn(shell, 'runCommand').mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
    const agent = createCodexCli()
    await agent.run({ prompt: 'x', cwd: tmpCwd, env: { FOO: 'bar' } as any })
    const calledEnv = (spy.mock.calls[0][2] as any).env
    expect(calledEnv.FOO).toBe('bar')
    expect(calledEnv.LLM_ENDPOINT).toBeUndefined()
  })

  // legacy provider-specific env vars have been removed; callers must set LLM_ENDPOINT
})

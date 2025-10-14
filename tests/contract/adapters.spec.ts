import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCodexCli } from '../../src/adapters/agent/codexCli';
import * as shell from '../../src/io/shell';
import { createVllm } from '../../src/adapters/llm/vllm';

describe('adapters contracts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('agent adapter executes CLI and propagates result', async () => {
    const spy = vi
      .spyOn(shell, 'runCommand')
      .mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
    const agent = createCodexCli();
    const res = await agent.run({ prompt: 'do x', cwd: process.cwd() });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('ok');
    expect(spy).toHaveBeenCalled();
  });

  it('llm adapter returns text and handles http', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'hello' } }] }),
      } as any;
    });
    const llm = createVllm({});
    const out = await llm.generate({ prompt: 'hi' });
    expect(out.text).toBe('hello');
    globalThis.fetch = originalFetch;
  });
});

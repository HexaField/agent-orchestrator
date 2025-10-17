import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, expect, it } from 'vitest'

import { createCodexCli } from '../../src/adapters/agent/codexCli'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-codex-test-'))

// MVP test: ensure the codex agent adapter can be invoked and attempts to write files
it('codex agent adapter attempts to write files (MVP)', async () => {
  // init git so adapter can stage/commit if it writes files
  try {
    fs.mkdirSync(path.join(tmp, '.git'), { recursive: true })
    // a minimal git init is sufficient for adapter to run git commands in tests
    // we won't rely on system git here — the adapter will attempt to run git; this test
    // is an MVP and may fail if git is not available in the environment.
  } catch {}

  // minimal spec and progress files
  fs.writeFileSync(path.join(tmp, 'spec.md'), '# MVP Spec\n\nCreate a small file', 'utf8')
  fs.writeFileSync(
    path.join(tmp, 'progress.json'),
    JSON.stringify({ checklist: ['MVP'], status: 'initialized', version: 1 }, null, 2),
    'utf8'
  )

  const adapter = createCodexCli()

  // Call adapter.run with a simple prompt. We do not set any env vars; this is an MVP invocation.
  const res = await adapter.run({
    prompt: 'Implement the spec.',
    cwd: tmp,
    env: { LLM_ENDPOINT: 'http://localhost:11423/v1', LLM_PROVIDER: 'ollama', LLM_MODEL: 'gpt-oss:20b' }
  })

  // The adapter tries to extract files into the workspace or writes .agent/patches.diff
  const agentDir = path.join(tmp, '.agent')
  const patches = path.join(agentDir, 'patches.diff')
  const wrotePatches = fs.existsSync(patches)

  console.log(fs.readdirSync(tmp))

  // Also check for any files under the workspace root (simple heuristic)
  const wroteAnyFile = fs
    .readdirSync(tmp)
    .some((f) => f !== '.agent' && f !== '.git' && f !== 'spec.md' && f !== 'progress.json')

  // Assert either patches file exists or some additional file was created.
  // Also assert the adapter returned some stdout/stderr shape to avoid unused var.
  expect(Boolean(res)).toBe(true)
  expect(wrotePatches || wroteAnyFile).toBe(true)
}, 120_000)

afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {}
})

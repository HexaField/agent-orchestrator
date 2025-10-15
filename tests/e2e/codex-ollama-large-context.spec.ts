import { execa } from 'execa'
import { readdirSync, rmSync, writeFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { seedConfigFor } from '../support/seedConfig'

const repoRoot = path.resolve(__dirname, '../../')
const cli = path.resolve(__dirname, '../../bin/agent-orchestrator')

// Use the local Ollama base URL (adapter will call /api/generate)
const LLM_ENDPOINT = 'http://localhost:11434'

function prepareExecEnv(workdir: string, extra: Record<string, string> = {}) {
  const fakeHome = path.join(workdir, '.home')
  try {
    require('fs').mkdirSync(fakeHome, { recursive: true })
    const codexDir = path.join(fakeHome, '.codex')
    require('fs').mkdirSync(codexDir, { recursive: true })
    require('fs').writeFileSync(path.join(fakeHome, '.cargo', 'env'), '', 'utf8')
    const conf = `model = "gpt-oss-20b"\nmodel_provider = "ollama"\n\n[model_providers.ollama]\nname     = "Ollama"\n  base_url = "${LLM_ENDPOINT}"\n`
    require('fs').writeFileSync(path.join(codexDir, 'ao-config.toml'), conf, 'utf8')
    require('fs').writeFileSync(path.join(codexDir, 'config.toml'), conf, 'utf8')
  } catch {}

  const baseEnv: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v != null) baseEnv[k] = String(v)
  Object.assign(baseEnv, {
    LLM_PROVIDER: 'ollama',
    LLM_ENDPOINT: LLM_ENDPOINT,
    LLM_MODEL: 'gpt-oss:20b',
    AGENT: 'agent-replay',
    LLM_TIMEOUT_MS: '120000',
    HOME: fakeHome,
    ...extra
  })
  return baseEnv
}

async function ensureInitAndRun(tmp: string, prompt: string, stubUrl?: string) {
  // create dir
  await execa('mkdir', ['-p', tmp])
  await execa('git', ['init'], { cwd: tmp })
  // write a very large spec to trigger large context usage
  const bigSpec = prompt
  writeFileSync(path.join(tmp, 'spec.md'), bigSpec, 'utf8')
  writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'ao-e2e', version: '0.0.0', scripts: { test: 'echo OK' } }, null, 2)
  )

  // seed config
  await seedConfigFor(tmp, { LLM_PROVIDER: 'ollama', LLM_ENDPOINT: stubUrl || LLM_ENDPOINT, AGENT: 'agent-replay' })

  // init
  await execa('node', [cli, 'init', '--cwd', tmp], { env: prepareExecEnv(tmp) })

  // run once; allow run to progress until a terminal-ish state
  await execa('node', [cli, 'run', '--cwd', tmp, '--non-interactive'], { env: prepareExecEnv(tmp), timeout: 180000 })
}

describe('E2E codex + Ollama large-context smoke test', () => {
  // This test now assumes a real local Ollama service is running at
  // the configured `LLM_ENDPOINT`. If Ollama is not available the test
  // will fail. The e2e intentionally uses real services to validate
  // runtime behavior for large contexts.

  it(
    'runs full flow with a very large prompt',
    async () => {
      const tmp = path.join(repoRoot, '.e2e', `BIG-${Date.now()}`)
      // ensure old tmp doesn't exist so we can inspect previous artifacts when
      // re-running the test (cleanup at start)
      try {
        rmSync(tmp, { recursive: true, force: true })
      } catch {}

      // Build a very large prompt (~100k characters) consisting of repeated spec content
      const block = 'export function example() { return "hello" }\\n// line filler\\n'
      let prompt = ''
      for (let i = 0; i < 5000; i++) prompt += block // ~5000 * ~50 chars => ~250KB

      // run the flow (init + run)
      // No stub: allow seedConfig to use the configured LLM_ENDPOINT
      await ensureInitAndRun(tmp, prompt, undefined)

      // Check minimal artifacts exist
      const agentDir = path.join(tmp, '.agent')
      const runsDir = path.join(agentDir, 'runs')
      const runs = readdirSync(runsDir)
      expect(runs.length).toBeGreaterThan(0)

      // Intentionally DO NOT remove tmp here so test artifacts remain for inspection.
    },
    10 * 60 * 1000 // 10 minutes
  )
})

import { writeProjectConfig } from '../../src/config'

export async function seedConfigFor(tmpDir: string, partial: Record<string, any> = {}) {
  const base: Record<string, any> = {
    LLM_PROVIDER: 'passthrough',
    LLM_MODEL: 'gpt-oss:20b',
    LLM_ENDPOINT: 'http://localhost:11434/v1',
    AGENT: 'agent-replay',
    ALLOW_COMMANDS: undefined,
    USE_LLM_GEN: undefined,
    USE_LLM_REVIEW: undefined,
    USE_LLM_EVAL: undefined,
    SKIP_VERIFY: undefined,
    RESPONSE_TYPE: undefined,
    REPLAY_FIXTURE: undefined
  }
  const cfg = { ...base, ...partial }
  // allow tests to pass a stubUrl key as an alias for LLM_ENDPOINT
  if (partial && partial.stubUrl) cfg.LLM_ENDPOINT = partial.stubUrl
  await writeProjectConfig(cfg as any, tmpDir)
}

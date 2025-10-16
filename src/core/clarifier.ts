import { execa } from 'execa'
import fs from 'fs'
import path from 'path'
import { getLLMAdapter } from '../adapters/llm'
import { getEffectiveConfig } from '../config'
import { withLock } from './locks'

export interface ClarifierOptions {
  approve?: boolean
  maxSpecChars?: number
  temperature?: number
}

/**
 * Core clarifier: synthesize a clarification for the last run if it
 * ended with 'needs_clarification'. Returns the raw LLM reply and
 * a path to a persisted audit file when available.
 */
export async function clarifyLastRun(cwd: string, opts: ClarifierOptions = {}) {
  return withLock(cwd, async () => {
    const statePath = path.join(cwd, '.agent', 'state.json')
    if (!fs.existsSync(statePath)) return null
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    const runId: string | null = state && state.currentRunId
    if (!runId) return null

    const runPath = path.join(cwd, '.agent', 'runs', runId, 'run.json')
    if (!fs.existsSync(runPath)) return null
    const runJson = JSON.parse(fs.readFileSync(runPath, 'utf8'))

    // Extract the agent's final response; prefer outputs.stdout then last item text
    let agentText = ''
    try {
      agentText = String((runJson && runJson.outputs && runJson.outputs.stdout) || '')
      if (!agentText) {
        const items = (runJson && runJson.items) || []
        if (Array.isArray(items) && items.length > 0) {
          const last = items[items.length - 1]
          agentText = String(last && (last.text || last.output || last.aggregated_output || ''))
        }
      }
    } catch {
      agentText = ''
    }

    // Read a reasonable slice of the spec for context
    let spec = ''
    try {
      const specPath = path.join(cwd, 'spec.md')
      if (fs.existsSync(specPath)) {
        const raw = fs.readFileSync(specPath, 'utf8')
        spec = raw.slice(0, opts.maxSpecChars || 64 * 1024)
      }
    } catch {}

    const prompt = `Spec:\n${spec}\n\nAgent final message:\n${agentText}\n\nAnswer any outstanding clarifying question succinctly, or if none are outstanding reply exactly with the single word: proceed`

    // Use project config to pick provider/endpoint
    let provider = 'ollama'
    let endpoint: string | undefined = undefined
    let model: string | undefined = undefined
    try {
      const cfg = await getEffectiveConfig(cwd)
      if (cfg) {
        provider = cfg.LLM_PROVIDER || provider
        endpoint = cfg.LLM_ENDPOINT
        model = cfg.LLM_MODEL
      }
    } catch {}

    const llm = getLLMAdapter(provider, { endpoint, model })
    const llmOut = await llm.generate({ prompt, temperature: opts.temperature ?? 0 })
    const reply = (llmOut && llmOut.text) || 'proceed'

    // persist audit
    let auditPath: string | null = null
    try {
      const outDir = path.join(cwd, '.agent', '.auto-answers')
      fs.mkdirSync(outDir, { recursive: true })
      const p = path.join(outDir, `${runId}-llm-clarify.json`)
      fs.writeFileSync(
        p,
        JSON.stringify({ runId, reply, ts: new Date().toISOString(), method: 'llm-clarify-v1' }, null, 2),
        'utf8'
      )
      auditPath = p
    } catch {}

    // If the caller requested approval/posting, use the CLI to create a
    // human-like clarification record so it follows the same code path.
    if (opts.approve) {
      try {
        const repoRoot = process.cwd()
        const cli = path.join(repoRoot, 'bin', 'agent-orchestrator')
        await execa('node', [cli, 'clarify', '--cwd', cwd, '--text', reply, '--approve'], { env: process.env })
      } catch {}
    }

    return { runId, reply, auditPath }
  })
}

export default { clarifyLastRun }

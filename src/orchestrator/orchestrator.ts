import path from 'path'
import fs from 'fs/promises'
import { compilePrompt } from './promptCompiler'
import { buildContextPack } from './contextPack'
import progressApi from './progress'
import { runTaskLoop } from './taskLoop'

export type OrchestratorOpts = {
  specPath?: string
  templateName?: string
  inputs?: Record<string, any>
  adapters: { agent: any; llm: any }
  workDir?: string
}

export async function runOrchestrator(opts: OrchestratorOpts) {
  const workDir = opts.workDir ?? process.cwd()
  const runId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  const runDir = path.join(process.cwd(), '.agent', 'run', runId)
  await fs.mkdir(runDir, { recursive: true })

  // initialize progress
  await progressApi.initProgress(runId, opts.specPath)

  // build context pack
  const context = await buildContextPack(runId)

  // merge provided inputs with context-derived values
  const inputs = Object.assign({ title: opts.specPath ?? runId, specPath: opts.specPath ?? '' }, opts.inputs ?? {}, { checklist: context.checklist ?? [] })

  // compile prompt
  const template = opts.templateName ?? 'spec.md'
  const compiled = await compilePrompt(template, inputs)

  // write compiled prompt to run folder
  const compiledPath = path.join(runDir, 'compiled_prompt.md')
  await fs.writeFile(compiledPath, compiled.user, 'utf8')

  // call task loop using compiled user prompt as the task
  const task = compiled.user
  const taskLoopRes = await runTaskLoop({
    task,
    agent: opts.adapters.agent,
    llm: opts.adapters.llm,
    workDir,
    runDir,
  })

  // persist summary
  const summary = { runId: taskLoopRes.runId, orchestratorRunId: runId, summary: taskLoopRes.summary, steps: taskLoopRes.steps }
  await fs.writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8')

  // update progress with summary
  await progressApi.updateProgress(runId, { summary: { success: !!taskLoopRes.summary.success, errors: taskLoopRes.summary.success ? [] : [taskLoopRes.summary.reason ?? 'failed'] } } as any)

  return { runId, runDir, taskLoopRes }
}

export default { runOrchestrator }

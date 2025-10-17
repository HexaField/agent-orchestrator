import { Command } from 'commander'
import { readFileSync } from 'fs'
import path from 'path'
import { applyProgressPatch } from '../../core/progress'
import { genUpdate } from '../../core/templates'
import { genTodoListLLM } from '../../core/generatorClient'

/**
 * CLI command: spec-to-progress
 * - Reads spec.md from the repo (or provided --cwd)
 * - Generates a progress patch based on an inferred 'whatDone' (defaults to needs_clarification)
 * - Applies the progress patch to the workspace unless --dry-run
 */
const specToProgress = new Command('spec-to-progress')
  .description('Generate a progress.json update from spec.md and apply it')
  .option('--cwd <path>', 'Working directory', '.')
  .option('--dry-run', 'Print the generated progress patch instead of writing', false)
  .option('--use-llm', 'Use LLM to generate a todo list (disabled by default in tests)', false)
  .action(async (opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd ?? '.')
    let specText = ''
    try {
      specText = readFileSync(path.join(cwd, 'spec.md'), 'utf8')
    } catch {}

    // Heuristic: if spec contains 'implement' assume spec_implemented else needs_clarification
    const whatDone = /implement/i.test(specText) ? 'spec_implemented' : 'needs_clarification'
    const upd = genUpdate({ whatDone: whatDone as any })

    // Optionally use LLM to generate a todo list and attach it as a checklist
    if (opts.useLlm) {
      try {
        const provider = 'ollama'
        const todos = await genTodoListLLM(provider, specText)
        if (Array.isArray(todos) && todos.length > 0) {
          // create ProgressItem entries
          const checklistItems = todos.map((t: any) => ({
            done: false,
            description: `${t.title || ''}${t.description ? ': ' + t.description : ''}`
          }))
          upd.progressPatch.checklist = checklistItems
        }
      } catch {
        // if LLM generation fails, continue silently and apply default patch
      }
    }

    if (opts.dryRun) {
      process.stdout.write(JSON.stringify(upd.progressPatch) + '\n')
      return
    }

    await applyProgressPatch(cwd, upd.progressPatch)
    process.stdout.write('progress updated\n')
  })

export default specToProgress

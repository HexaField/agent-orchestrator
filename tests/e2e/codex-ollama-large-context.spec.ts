import { execa } from 'execa'
import fs, { rmSync } from 'fs'
import path from 'path'
import { expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../')

// Force the agent and LLM provider/model for this e2e to avoid replay/read-only behavior
process.env.AGENT = process.env.AGENT || 'codex'
process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'ollama'
process.env.LLM_MODEL = process.env.LLM_MODEL || 'gpt-oss:20b'

it(
  'completes progress.json autonomously from spec.md',
  async () => {
    /**
     * 1. Create a temporary directory with a minimal spec.md
     */
    const tmp = path.join(repoRoot, '.tmp', `E2E-${Date.now()}`)
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {}

    try {
      await execa('mkdir', ['-p', tmp])
      await execa('git', ['init'], { cwd: tmp })
    } catch {}

    // Generate spec
    const spec = `
Project: summarize — a dependency‑free Node.js CLI

Goal:
- Implement a small CLI that reads a UTF‑8 text file (or stdin) and prints a concise summary:
1) Title: first non-empty line of the input
2) Lines: total line count
3) Words: total word count (split on whitespace)

Constraints:
- Node >= 18 only; no external libraries or network calls.
- Declarative, functional style; pure functions for core logic.
- JSDoc for all functions and methods.

CLI behavior:
- Name: summarize
- Usage: summarize [filePath|-] [--max-bytes N] [--help] [--version]
- If filePath is "-" or omitted, read from stdin.
- --max-bytes N: limit the number of bytes read (truncate input processing).
- --help: print usage and exit 0.
- --version: print version from package.json and exit 0.
- Exit codes: 0 on success; 1 on usage/file errors. Errors to stderr.
- Output exactly three lines in this order:
Title: <first non-empty line or empty string>
Lines: <number>
Words: <number>

Repository structure:
- package.json: "type": "module"; "bin": {"summarize": "bin/summarize.js"};
- bin/summarize.js: executable entry with shebang; minimal CLI wiring that delegates to pure functions.
- src/text.js: pure functions only (no I/O side effects beyond reading provided streams/strings).
- README.md: brief description and usage examples.

Suggested pure functions in src/text.js:
- readStream(stream, maxBytes?) -> Promise<string>
- toLines(text: string) -> string[]
- firstNonEmptyLine(lines: string[]) -> string
- countWords(text: string) -> number
- summarizeText(text: string) -> { title: string; lines: number; words: number }

Acceptance criteria:
- echo "Hello\nworld" | node bin/summarize.js - outputs:
Title: Hello
Lines: 2
Words: 2
- node bin/summarize.js --help prints usage and exits 0.
- node bin/summarize.js --version prints the version and exits 0.
- node bin/summarize.js missing.txt exits 1 with an error on stderr.
- node bin/summarize.js sample.txt --max-bytes 5 respects the limit and still produces three lines.
`
    fs.writeFileSync(path.join(tmp, 'spec.md'), spec, 'utf8')

    /**
     * 2. Run the init command to initialize the agent-orchestrator in the project
     */

    // allow long-running CLI actions during e2e (15 minutes)
    const CLI_TIMEOUT = 15 * 60 * 1000
    // run init via npx to ensure local bin is used even if not linked
    const npxBin = path.join(repoRoot, 'bin', 'agent-orchestrator')
    await execa('node', [npxBin, 'init', '--cwd', tmp], {
      timeout: CLI_TIMEOUT,
      stdout: 'inherit',
      stderr: 'inherit',
      verbose: 'full'
    })

    // assert project structure created
    expect(fs.existsSync(path.join(tmp, '.agent'))).toBe(true)

    /**
     * 3. Run the spec-to-progress command to generate progress.json and then verify
     */

    await execa('node', [npxBin, 'spec-to-progress', '--cwd', tmp], {
      timeout: CLI_TIMEOUT,
      stdout: 'inherit',
      stderr: 'inherit'
    })

    // verify progress.json exists and status sections are marked completed
    const progressPath = path.join(tmp, 'progress.json')
    expect(fs.existsSync(progressPath)).toBe(true)
    const prog = JSON.parse(fs.readFileSync(progressPath, 'utf8'))
    // ensure status is not initialized or needs_clarification or awaiting_approval
    expect(/initialized|needs_clarification|awaiting_approval/i.test(prog.status || '')).toBe(false)

    /**
     * 4. Run the agent to autonomously complete the progress.json and generate the CLI
     */

    // run which will invoke runOnce and the automated clarifier we added
    // Ensure project config uses the codex write-capable agent and desired LLM
    try {
      await execa('node', [
        '-e',
        `require('fs').mkdirSync('${path.join(tmp, '.agent')}', { recursive: true }); require('fs').writeFileSync('${path.join(
          tmp,
          '.agent',
          'config.json'
        )}', JSON.stringify({ AGENT: 'codex-cli', LLM_PROVIDER: 'ollama', LLM_MODEL: 'gpt-oss:20b' }, null, 2), 'utf8')`
      ])
    } catch {}

    await execa('node', [npxBin, 'run', '--cwd', tmp], {
      timeout: CLI_TIMEOUT,
      stdout: 'inherit',
      stderr: 'inherit',
      verbose: 'full'
    })

    // verify run artifacts were recorded under .agent/runs/<runId>/
    const runsDir = path.join(tmp, '.agent', 'runs')
    expect(fs.existsSync(runsDir)).toBe(true)
    const runs = fs.existsSync(runsDir)
      ? fs.readdirSync(runsDir).filter((name) => fs.statSync(path.join(runsDir, name)).isDirectory())
      : []
    expect(runs.length).toBeGreaterThan(0)

    // pick the most-recent run directory and assert run.json and patches.diff exist
    const runDirs = runs.map((name) => path.join(runsDir, name))
    runDirs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    const runPath = runDirs[0]
    const runJsonPath = path.join(runPath, 'run.json')
    expect(fs.existsSync(runJsonPath)).toBe(true)
    const runJson = JSON.parse(fs.readFileSync(runJsonPath, 'utf8'))
    // basic sanity: run.json should be an object and contain some metadata
    expect(typeof runJson).toBe('object')
    expect(runJson).not.toBeNull()

    const patchesPath = path.join(runPath, 'patches.diff')
    expect(fs.existsSync(patchesPath)).toBe(true)

    // Execute the generated CLI and assert acceptance criteria
    const binPath = path.join(tmp, 'bin', 'summarize.js')

    // If the run did not implement the spec, print diagnostics to help debug
    if (runJson.whatDone !== 'spec_implemented') {
      // print high-level fields
      console.log('E2E: run.whatDone=', runJson.whatDone)
      const lastAgentMessage = (() => {
        try {
          const stdout = runJson.outputs?.stdout || ''
          // try to find the last agent_message text in NDJSON
          const lines = String(stdout).split(/\r?\n/).filter(Boolean)
          for (let i = lines.length - 1; i >= 0; i--) {
            const l = lines[i]
            try {
              const parsed = JSON.parse(l)
              if (parsed?.item?.type === 'agent_message' && parsed.item.text) return parsed.item.text
              if (parsed?.type === 'agent_message' && parsed.text) return parsed.text
            } catch {
              // not JSON - continue
            }
          }
        } catch {
          // ignore
        }
        return undefined
      })()
      if (lastAgentMessage) console.log('E2E: last agent_message=', lastAgentMessage)
      if (runJson.outputs?.patches && runJson.outputs.patches.length) {
        console.log('E2E: patches at', runJson.outputs.patches[0])
      }

      // If patches.diff looks like a unified git diff, attempt to apply it so we can assert generated files
      try {
        const patchCandidate = runJson.outputs?.patches?.[0] || patchesPath
        if (patchCandidate && fs.existsSync(patchCandidate)) {
          const content = fs.readFileSync(patchCandidate, 'utf8')
          const looksLikeUnified = /^(?:diff --git |\+\+\+ |--- )/m.test(content)
          if (looksLikeUnified) {
            console.log('E2E: attempting to apply unified patch', patchCandidate)
            const execSync = require('child_process').execSync
            execSync(`git apply --index "${patchCandidate}"`, { cwd: tmp })
          } else {
            console.log('E2E: patches.diff does not look like a unified git diff; skipping apply')
          }
        }
      } catch (err: any) {
        console.log('E2E: failed to apply patches.diff:', err?.message ?? String(err))
      }
    }

    expect(fs.existsSync(binPath)).toBe(true)

    // --help exits 0
    await execa('node', [binPath, '--help'], {
      cwd: tmp,
      timeout: CLI_TIMEOUT,
      stdout: 'inherit',
      stderr: 'inherit',
      verbose: 'full'
    })

    // --version matches package.json
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'))
    const ver = await execa('node', [binPath, '--version'], { cwd: tmp, timeout: CLI_TIMEOUT })
    expect(ver.stdout.trim()).toBe(pkg.version)

    // stdin example
    const stdinRun = await execa('node', [binPath, '-'], {
      cwd: tmp,
      input: 'Hello\nworld\n',
      timeout: CLI_TIMEOUT
    })
    expect(stdinRun.stdout.trim()).toBe(['Title: Hello', 'Lines: 2', 'Words: 2'].join('\n'))

    // missing file exits 1 with stderr
    await expect(execa('node', [binPath, 'missing.txt'], { cwd: tmp, timeout: CLI_TIMEOUT })).rejects.toMatchObject({
      exitCode: 1,
      stdout: 'inherit',
      stderr: 'inherit'
    })

    // --max-bytes respected and still outputs three lines
    const samplePath = path.join(tmp, 'sample.txt')
    fs.writeFileSync(samplePath, 'Hello\nworld', 'utf8')
    const limited = await execa('node', [binPath, samplePath, '--max-bytes', '5'], { cwd: tmp, timeout: CLI_TIMEOUT })
    expect(limited.stdout.trim()).toBe(['Title: Hello', 'Lines: 1', 'Words: 1'].join('\n'))
  },
  // allow up to 10 minutes for full e2e run
  10 * 60 * 1000
)

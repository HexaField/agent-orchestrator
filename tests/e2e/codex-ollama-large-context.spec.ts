import { execa } from 'execa'
import fs, { rmSync } from 'fs'
import path from 'path'
import { expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../')

it('completes progress.json autonomously from spec.md', async () => {
  const tmp = path.join(repoRoot, '.e2e', `E2E-${Date.now()}`)
  try {
    rmSync(tmp, { recursive: true, force: true })
  } catch {}

  // minimal spec
  try {
    await execa('mkdir', ['-p', tmp])
    await execa('git', ['init'], { cwd: tmp })
  } catch {}

  const prompt = `
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
  fs.writeFileSync(path.join(tmp, 'spec.md'), prompt, 'utf8')

  // allow long-running CLI actions during e2e (15 minutes)
  const CLI_TIMEOUT = 15 * 60 * 1000
  // run init via npx to ensure local bin is used even if not linked
  const npxBin = path.join(repoRoot, 'bin', 'agent-orchestrator')
  await execa('node', [npxBin, 'init', '--cwd', tmp], { timeout: CLI_TIMEOUT })

  // run which will invoke runOnce and the automated clarifier we added
  await execa('node', [npxBin, 'run', '--cwd', tmp], { timeout: CLI_TIMEOUT })

  // verify progress.json exists and status sections are marked completed
  const progressPath = path.join(tmp, 'progress.json')
  expect(fs.existsSync(progressPath)).toBe(true)
  const prog = JSON.parse(fs.readFileSync(progressPath, 'utf8'))
  // ensure status is not initialized or needs_clarification or awaiting_approval
  expect(/initialized|needs_clarification|awaiting_approval/i.test(prog.status || '')).toBe(false)

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
  expect(fs.existsSync(binPath)).toBe(true)

  // --help exits 0
  await execa('node', [binPath, '--help'], { cwd: tmp, timeout: CLI_TIMEOUT })

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
    exitCode: 1
  })

  // --max-bytes respected and still outputs three lines
  const samplePath = path.join(tmp, 'sample.txt')
  fs.writeFileSync(samplePath, 'Hello\nworld', 'utf8')
  const limited = await execa('node', [binPath, samplePath, '--max-bytes', '5'], { cwd: tmp, timeout: CLI_TIMEOUT })
  expect(limited.stdout.trim()).toBe(['Title: Hello', 'Lines: 1', 'Words: 1'].join('\n'))
})

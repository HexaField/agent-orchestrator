import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { AgentAdapter } from '../adapters/agent/interface'
import { createOpenCodeAgentAdapter } from '../adapters/agent/opencode'
import { LLMAdapter } from '../adapters/llm/interface'
import createOllamaAdapter from '../adapters/llm/ollama'
import runTaskLoop from './taskLoop'

const run = process.env.E2E === '1' ? describe : describe.skip

run('TaskLoop (integration with OpenCode & Ollama)', () => {
  let tmpdir: string
  let agent: AgentAdapter
  let llm: LLMAdapter

  beforeEach(async () => {
    const pwd = process.cwd()
    tmpdir = path.join(pwd, '/.tmp/' + Date.now().toString())
    fs.mkdirSync(tmpdir, { recursive: true })

    // pick a free port for this test run to avoid collisions when tests run in parallel
    const getFreePort = (): Promise<number> =>
      new Promise((resolve, reject) => {
        const net = require('net')
        const s = net.createServer()
        s.unref()
        s.on('error', reject)
        s.listen(0, () => {
          const port = (s.address() as any).port
          s.close(() => resolve(port))
        })
      })

    const port = await getFreePort()
    agent = await createOpenCodeAgentAdapter(port, tmpdir)
    llm = createOllamaAdapter({})
  })

  afterEach(async () => {
    await agent.stop()
  })

  /**
   * 1. **CSV → JSON (streaming) transformer**
   * Build a TypeScript CLI/library that streams a CSV file from `stdin` and outputs newline-delimited JSON to `stdout`, with options `--schema infer|strict`, `--delimiter ,|;|\\t`, and `--limit <n>`; it must correctly handle quoted fields, embedded newlines, escaped quotes, UTF-8 BOM, and files larger than memory via Node streams, expose a typed `transform(input: AsyncIterable<string>, opts)` API, and include unit tests for edge cases plus golden tests that assert exact `stdout` SHA-256 for three fixtures (normal, tricky quotes, 1M-row synthetic with deterministic PRNG), property tests that round-trip CSV↔JSON for inferred schema, and performance asserts (process 50MB in <10s on a single thread) with timeouts; zero network calls and only `node:stream`, `fs`, and `crypto` deps allowed.
   */
  test('CSV → JSON transformer: agent generates a TypeScript CLI in workDir', async () => {
    // Prepare a small CSV fixture for the agent to validate against (agent will be asked
    // to create a CLI that can process this input). We don't implement the transformer
    // here — the agent must generate the TypeScript CLI source files in `tmpdir`.
    const fixture = 'name,age\n"Alice",30\n"Bob, Jr.",25\n'
    const csvPath = path.join(tmpdir, 'sample.csv')
    fs.writeFileSync(csvPath, fixture, 'utf8')

    const task = `Implement a TypeScript CLI named csv2json that reads CSV from stdin and
writes newline-delimited JSON to stdout. Put the TypeScript source in the current
working directory. It should accept options --schema infer|strict, --delimiter ,|;|\t
and --limit <n>. Please write the code and any brief README explaining how to run it.
After writing the files, print one-line confirmation of the main file path to stdout.`

    const res = await runTaskLoop({ task, agent, llm, workDir: tmpdir, maxIterations: 8 })

    expect(res).toBeDefined()
    // Agent may either write source files into the workDir or emit the source
    // in its step output. Accept either case.
    const tsFiles = fs.readdirSync(tmpdir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    const anyCodeInSteps = res.steps.some((s) => {
      const t = s.output && typeof s.output.text === 'string' ? s.output.text : ''
      return /```|export\s+|function\s+|class\s+|const\s+\w+\s*=/.test(t)
    })

    expect(tsFiles.length > 0 || anyCodeInSteps).toBe(true)
  }, 180000)

  /**
   * 2. **Static Markdown → HTML docsite generator with link checking**
   * Create a TS CLI `mdsite` that takes an input folder of `.md` files and produces a `/dist` static site with per-file HTML, a generated sidebar/TOC, deterministic slugging, local anchor linking, basic syntax highlighting implemented in-house for JS/TS fenced blocks (no external highlighters), and a `--check` mode that fails on broken internal links/anchors; include snapshot tests for three mini sites (single page, nested pages, anchors/footnotes), assert byte-for-byte deterministic HTML (stable timestamps, ordering, hashes), and provide a smoke test that runs `mdsite --check ./fixtures/site3` and expects exit code 1 with a specific error message for a deliberately broken link.
   */
  test.skip('Static Markdown → HTML docsite generator: agent creates mdsite CLI in workDir', async () => {
    // Create a tiny mini-site fixture that the agent can use as input if it chooses
    const siteDir = path.join(tmpdir, 'site')
    fs.mkdirSync(siteDir, { recursive: true })
    fs.writeFileSync(path.join(siteDir, 'index.md'), '# Home\n\nLink to [page2](page2.md#section)')
    fs.writeFileSync(path.join(siteDir, 'page2.md'), '# Page 2\n\n## Section\n\nContent')

    const task = `Implement a TypeScript CLI named mdsite that takes a folder of Markdown files and
produces a deterministic static site under ./dist. Provide --check mode that validates
internal anchors and exits non-zero on broken links. Place the TypeScript sources in the
current working directory and include a short README describing usage. After writing the
files, print one-line confirmation mentioning 'mdsite' and the path to the main file.`

    const res = await runTaskLoop({ task, agent, llm, workDir: tmpdir, maxIterations: 10 })

    expect(res).toBeDefined()

    // Accept either physical TypeScript files or agent-provided code in step outputs
    const tsFiles = fs.readdirSync(tmpdir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    const anyCodeInSteps = res.steps.some((s) => {
      const t = s.output && typeof s.output.text === 'string' ? s.output.text : ''
      return /```|<html>|export\s+|function\s+|class\s+|const\s+\w+\s*=/.test(t)
    })

    // Also check that the agent mentioned mdsite or dist in its outputs
    const anyMention = res.steps.some(
      (s) => s.output && typeof s.output.text === 'string' && /mdsite|dist|--check/.test(s.output.text)
    )

    expect(tsFiles.length > 0 || anyCodeInSteps).toBe(true)
    expect(anyMention).toBe(true)
  }, 180000)

  /**
   * 3. **Dependency resolver with DAG topo-sort & cycle diagnostics**
   * Implement a minimal package graph resolver: given a `packages.json` describing packages, versions, and semver-like ranges (`^`, `~`, exact), compute a lock order (topological install order) and resolve versions with deterministic tie-breaking; on cycles, emit a canonical cycle explanation (smallest lexicographic cycle) and non-zero exit; provide a library API `resolve(graph, ranges)` and CLI `resolver packages.json` that prints a JSON lockfile; tests must cover: simple DAG, diamond deps with version pinning, conflict producing backtracking, and a cycle; assert exact JSON output (sorted keys, stable whitespace), plus property tests that the topo order is valid for 100 random DAGs seeded with `--seed 12345`; no network, no semver lib—write a tiny range matcher.
   */
  test('Dependency resolver: agent creates resolver CLI in workDir', async () => {
    // Write a simple packages.json fixture the agent can use
    const pkg = {
      packages: {
        a: { version: '1.0.0', dependencies: { b: '^1.0.0' } },
        b: { version: '1.0.0', dependencies: {} }
      }
    }
    const pkgPath = path.join(tmpdir, 'packages.json')
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8')

    const task = `Implement a TypeScript library and CLI named resolver that reads a packages.json
file describing packages and ranges and prints a deterministic lockfile JSON to stdout or writes
lockfile.json in the current directory. Provide a programmatic API resolve(graph, ranges) and a
CLI resolver packages.json. Place TypeScript sources in the current working directory and include
a short README. After writing the files, print one-line confirmation mentioning 'resolver' and 'lockfile'.`

    const res = await runTaskLoop({ task, agent, llm, workDir: tmpdir, maxIterations: 8 })

    expect(res).toBeDefined()

    // Accept either physical TypeScript files or agent-provided code in step outputs
    const tsFiles = fs.readdirSync(tmpdir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    const anyCodeInSteps = res.steps.some((s) => {
      const t = s.output && typeof s.output.text === 'string' ? s.output.text : ''
      return /```|export\s+function\s+resolve|function\s+resolve|CLI|resolver/.test(t)
    })

    const anyMention = res.steps.some(
      (s) => s.output && typeof s.output.text === 'string' && /resolver|lockfile|resolve/.test(s.output.text)
    )

    // Also accept that a lockfile.json was written
    const lockExists = fs.existsSync(path.join(tmpdir, 'lockfile.json'))

    expect(tsFiles.length > 0 || anyCodeInSteps).toBe(true)
    expect(anyMention || lockExists).toBe(true)
  }, 120000)

  /**
   * 4. **Event-sourced TODO service (in-memory with crash/replay)**
   * Write a TS service exposing a CLI `todos` with commands `add <text>`, `complete <id>`, `list`, and `export` that stores only an append-only event log (`events.log`) and reconstructs state on startup; include idempotency via command UUIDs, optimistic concurrency (reject on stale `--expectedVersion`), and a simple snapshotting mechanism every N events; tests must simulate a “crash” by interleaving writes with process kills (spawn child process), verify replay yields identical state (assert SHA-256 of `export`), prove idempotent reapplication of duplicate commands, and verify that concurrent writes without expectedVersion fail; forbid network and external stores; only `fs` and `crypto` allowed; all tests must pass on repeated runs to guarantee determinism.
   */
  test('Event-sourced TODO service: agent creates todos CLI in workDir', async () => {
    // Ask the agent to implement an event-sourced todos service CLI that stores an
    // append-only events.log and exposes commands add/complete/list/export. We will not
    // simulate crashes here — the test asserts that the agent produced source files or
    // emitted the implementation and mentioned events.log/export in its outputs.

    const task = `Implement a TypeScript CLI named todos that stores only an append-only
events.log and exposes commands: add <text>, complete <id>, list, and export. The CLI
must reconstruct state by replaying events.log on startup, support idempotent commands
via command UUIDs, and provide an export command that writes JSON to stdout or
export.json. Place TypeScript sources in the current working directory and include a
short README. After writing files, print a one-line confirmation mentioning 'events.log' or 'export'.`

    const res = await runTaskLoop({ task, agent, llm, workDir: tmpdir, maxIterations: 8 })

    expect(res).toBeDefined()

    const tsFiles = fs.readdirSync(tmpdir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    const anyCodeInSteps = res.steps.some((s) => {
      const t = s.output && typeof s.output.text === 'string' ? s.output.text : ''
      return /```|events\.log|export\.json|todos|add\s+<text>|complete\s+<id>|export\(\)/.test(t)
    })

    const anyMention = res.steps.some(
      (s) => s.output && typeof s.output.text === 'string' && /events\.log|export|todos/.test(s.output.text)
    )

    const exportExists = fs.existsSync(path.join(tmpdir, 'export.json'))

    expect(tsFiles.length > 0 || anyCodeInSteps).toBe(true)
    expect(anyMention || exportExists).toBe(true)
  }, 120000)

  /**
   * 5. **Mini chess move validator with perft counts**
   * Create a pure TS library/CLI that parses FEN, generates legal moves (including captures, checks, castling legality with check detection, en passant rules), and computes perft counts up to depth 4 for given positions; implement only enough for legality (no evaluation/search), ensure deterministic move ordering (SAN/UCI stable sort), and expose `perft(fen, depth)`; include tests that assert exact perft numbers for standard positions (initial, Kiwipete, en passant trick, castling positions) and additional unit tests for edge rules (double check, illegal castle through check); the CLI `chess-perft "<FEN>" -d 3` prints a stable JSON report with node counts per depth, which is snapshot-tested; no external chess libraries or network deps.
   */
  test('Mini chess move validator with perft counts: agent creates chess-perft CLI in workDir', async () => {
    // Ask the agent to implement a minimal chess move generator and perft CLI.
    // We won't implement chess logic here; the agent must produce TypeScript
    // sources or emit the code in its outputs.

    const task = `Implement a pure TypeScript library and CLI named chess-perft that
parses FEN strings, generates legal moves (including captures, en passant, castling
legality), and exposes a function perft(fen, depth) plus a CLI chess-perft "<FEN>" -d <depth>
that prints a stable JSON report with node counts per depth. Place TypeScript sources in
the current working directory and include a short README. After writing files, print a
one-line confirmation mentioning 'chess-perft' and the main file path.`

    const res = await runTaskLoop({ task, agent, llm, workDir: tmpdir, maxIterations: 8 })

    expect(res).toBeDefined()

    const tsFiles = fs.readdirSync(tmpdir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    const anyCodeInSteps = res.steps.some((s) => {
      const t = s.output && typeof s.output.text === 'string' ? s.output.text : ''
      return /```|perft\(|chess-perft|perft\(fen|perft\s*\(|perft\s+\w+/.test(t)
    })

    const anyMention = res.steps.some(
      (s) => s.output && typeof s.output.text === 'string' && /chess-perft|perft/.test(s.output.text)
    )

    expect(tsFiles.length > 0 || anyCodeInSteps).toBe(true)
    expect(anyMention).toBe(true)
  }, 180000)
})

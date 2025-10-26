# Phase 4 Implementation Plan — Report Writer & CLI

Status: Draft

## Scope

Phase 4 finishes the user-facing surface: a ReportWriter that produces human-readable Markdown reports and machine summaries, plus a CLI entrypoint to start and manage runs with the options defined across phases.

## Objectives

- Implement `ReportWriter` to generate a human-readable Markdown report and a compact JSON machine summary from runs, steps, diffs, and verification outputs.
- Implement the CLI (`src/cli/index.ts`) with argument parsing and flags described in earlier phases (spec, phase, out, dry-run, llm selection, verify commands, etc.).
- Ensure CLI wiring creates run folders (`.agent/run/<id>/`), persists provenance, and returns a concise exit code and summary for automation.

## CLI Features (final)

- Top-level run command:

```
npx agent-orchestrator run --spec spec.md --phase implement --out .agent/run
```

- Flags to support:
  - `--dry-run`
  - `--max-steps`
  - `--llm` (ollama|vllm|agent)
  - `--agent` (opencode)
  - `--verify` (repeatable verification commands)
  - `--summary` (path for machine summary)
  - `--llm-host` (for local LLM endpoints)

## ReportWriter behavior

- Inputs: steps, verification report, diffs, citations
- Outputs: Markdown report (`.agent/run/<id>/report.md`) and JSON summary (`.agent/run/<id>/summary.json`)
- Include provenance links and timestamps; surface verification failures and command outputs for reviewers.

## CLI & Usage

The final CLI will orchestrate multi-phase runs.

```
npx agent-orchestrator run --spec spec.md --phase implement --out .agent/run
```

Optional flags to be supported by the CLI in Phase 1 testing:

- `--dry-run` (no writes, only planning and prompts)
- `--max-steps 50`
- `--llm ollama:llama3` or `--llm vllm:model`
- `--agent opencode`

## Deliverables (Phase 4)

- `reportWriter.ts` implementation + tests producing both formats.
- `src/cli/index.ts` CLI implementation + tests for argument parsing and basic run orchestration (can be partially stubbed to avoid running heavy integrations in tests).
- README updates documenting CLI usage.

## Acceptance Criteria (Phase 4)

- CLI command can start a Phase-1 run end-to-end (using previously implemented modules) and persist run artifacts.
- Reports include enough context for a reviewer to understand what changed and why, with links to diffs and verification outputs.

## Project Structure

```
.
├─ .agent/                           # runtime state (created at run-time)
│  ├─ run/<id>/                      # per-run artifacts
│  └─ memory/                        # persistent summaries
├─ src/
│  ├─ orchestrator/                  # policy-driven orchestration (clarify loop)
│  │  ├─ runner.ts
│  │  ├─ contextPack.ts
│  │  ├─ promptCompiler.ts
│  │  ├─ actionLoop.ts
│  │  ├─ verificationPlan.ts
│  │  └─ reportWriter.ts
│  ├─ adapters/                      # neutral interfaces + implementations
│  │  ├─ llm/
│  │  │  ├─ interface.ts
│  │  │  ├─ ollama.ts                # local REST API
│  │  │  └─ vllm.ts                  # OpenAI-compatible local endpoint
│  │  ├─ agent/
│  │  │  ├─ interface.ts
│  │  │  └─ opencode.ts              # initial agent provider support
│  │  ├─ exec/
│  │  │  ├─ interface.ts
│  │  │  └─ nodeProcess.ts
│  │  └─ fs/
│  │     ├─ interface.ts
│  │     └─ nodeFs.ts
│  ├─ verification/                  # verification engine adapters
│  │  ├─ interface.ts
│  │  └─ shellVerifier.ts            # runs user-configured commands
│  ├─ provenance/
│  │  ├─ recorder.ts
│  │  └─ metadata.ts
│  ├─ config/
│  │  ├─ schema.ts
│  │  └─ loader.ts
│  ├─ types/
│  │  └─ core.ts
│  └─ cli/
│     └─ index.ts
|- test/
│  └─ e2e/                           # end-to-end tests with real providers
├─ package.json
├─ tsconfig.json
└─ README.md
```

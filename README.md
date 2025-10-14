# Agent Orchestrator

A spec-driven coding agent orchestrator CLI that automates TDD workflows, maintains audit artifacts, and enforces review/commit gates.

## Features

- Orchestrated agent runs with pluggable LLM and agent adapters
- Spec-first flow with progress.md as source of truth
- Verification pipeline (npm scripts) with deterministic test mode
- Review and commit gating with changelog generation
- Audit trail of runs under `.agent/`

## Install

Clone and install dependencies:

```bash
npm install
```

Node.js 18+ required.

## Quick start

Initialize a repo for orchestration and run once using test-friendly adapters:

```bash
# 1) initialize (via npx from the project root)
npx agent-orchestrator init --cwd .

# 2) run once with passthrough LLM and custom agent
AO_SKIP_VERIFY=1 npx agent-orchestrator run --cwd . --llm passthrough --agent custom --prompt "implement spec"

# 3) check status
npx agent-orchestrator status --cwd .
```

## Commands

- `init` — Bootstraps `.agent/` directory, creates `progress.md`, initializes state
- `run` — Executes one orchestrated iteration (LLM → Agent → verify → update progress/changelog)
- `review` — Mark review result: `--approve` or `--request-changes`
- `status` — Print current orchestrator status
- `commit` — Gate-protected commit once status is `ready_to_commit`

Run `--help` on any command for options.

## Adapters

- LLM: `vllm`, `openai-compatible`, `passthrough`
- Agent: `copilot-cli`, `codex-cli`, `custom`

Configure via flags or project config. The `passthrough`/`custom` pair is used in tests to avoid network access.

## Progress and artifacts

- `.agent/state.json` — orchestrator state machine
- `.agent/runs/run-*/run.json` — per-run metadata, results, verification summary
- `.agent/audit.log` — append-only run log
- `progress.md` — contains machine-editable sections:
  - Status, Clarifications, Decisions, Next Task, Checklist

The orchestrator patches `progress.md` on each run based on outcomes.

### Marker format and response types

- File responses are parsed from agent stdout using a simple marker format. Use lines of the form:

  === filename.ext ===

  followed by the file contents until the next marker. Only well-formed markers (exact opening and closing `===` with a filename) will be written. Malformed or empty markers are ignored.

- Response types are controlled by the `AO_RESPONSE_TYPE` environment variable (one of `patches|files|commands|mixed`). By default the system uses `mixed` behavior.

### Patch apply failures and .rej preservation

- When `git apply --reject` produces `.rej` files (patch rejects), the orchestrator preserves those `.rej` files for audit. They are copied into the run artifact folder and recorded in the run's `applied.marker` diagnostics.

  - Non-git fallback: `.rej` files are copied to `.agent/runs/<runId>/rejections/` and listed in the in-repo `applied.marker`.
  - Git transactional failures: rejections are copied to the OS temp runs dir (e.g. `${os.tmpdir()}/agent-orchestrator/runs/<runId>/rejections`) to avoid leaving untracked files in the working tree; their relative paths are included in the `applied.marker` written to that location.

  This preserves audit information while keeping the working tree clean. You can inspect preserved rejections by reading the `applied.marker` JSON from the run artifact.

### Important environment flags

- `AO_ALLOW_COMMANDS=1` — allow the orchestrator to actually execute command responses (disabled by default for safety in tests/CI).
- `AO_DRY_RUN=1` — enable dry-run behavior for command execution (simulated outputs).
- `MOCK_RUN_COMMAND` — internal test hook that allows deterministic simulation of command outputs (JSON encoded).
- `AO_USE_LLM_GEN=1` — opt-in to LLM-backed prompt generators (otherwise deterministic generators are used).
- `AO_LLM_PROVIDER` — choose the LLM provider for generation when `AO_USE_LLM_GEN=1`.

## Verification

If `package.json` contains common scripts (e.g., `test`, `typecheck`, `lint`), the verifier will run them. During Vitest or with `AO_SKIP_VERIFY=1`, verification is skipped to avoid recursion.

## Development

- Tests: `npm test` or `npm run e2e`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`

## CI

This repo includes a GitHub Actions workflow that runs typecheck and tests on pushes and pull requests. See `.github/workflows/ci.yml`.

## Troubleshooting

- If ESM/CJS issues arise in dev, run `npm run build` and use the installed/packaged CLI via `npx agent-orchestrator`.
- To avoid slow verification during local e2e tests, set `AO_SKIP_VERIFY=1`.

## License

MIT

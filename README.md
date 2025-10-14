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
# 1) initialize
npx ts-node src/cli/index.ts init --cwd .

# 2) run once with passthrough LLM and custom agent
AO_SKIP_VERIFY=1 npx ts-node src/cli/index.ts run --cwd . --llm passthrough --agent custom --prompt "implement spec"

# 3) check status
npx ts-node src/cli/index.ts status --cwd .
```

In CI or when installed globally, use the bin:

```bash
agent-orchestrator init --cwd .
agent-orchestrator run --cwd .
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

## Verification

If `package.json` contains common scripts (e.g., `test`, `typecheck`, `lint`), the verifier will run them.
During Vitest or with `AO_SKIP_VERIFY=1`, verification is skipped to avoid recursion.

## Development

- Tests: `npm test` or `npm run e2e`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`

## CI

This repo includes a GitHub Actions workflow that runs typecheck and tests on pushes and pull requests. See `.github/workflows/ci.yml`.

## Troubleshooting

- If ESM/CJS issues arise in dev, use the provided bin which falls back to `ts-node`.
- To avoid slow verification during local e2e tests, set `AO_SKIP_VERIFY=1`.

## License

MIT

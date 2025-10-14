# Architecture & Operational Notes — Agent Orchestrator

This document contains an in-depth description of the system architecture, adapters, artifact layout, marker/response semantics, environment flags, CI, testing, and operational guidance for running the orchestrator in production or development.

## Goals and overview

- Orchestrate small, repeatable agent-driven development iterations where an LLM or agent suggests code changes from a spec. Each run is recorded and verified by project tests before changes are accepted.
- Keep a reproducible audit trail of all runs (`.agent/`), including artifacts, rejections, and human decisions.
- Provide safe defaults (dry-run, mock hooks) to avoid accidental command execution in CI and dev environments.

## High-level architecture

- CLI (`src/cli`) — user-facing commands: `init`, `run`, `status`, `review`, `commit`, etc.
- Orchestrator core (`src/core/orchestrator.ts`) — coordinates LLM generation, agent invocation, patch application, verification, and progress updates.
- Adapters:
  - LLM adapters (`src/adapters/llm/*`) — abstract LLM providers (vllm, openai-compatible, openai, passthrough).
  - Agent adapters (`src/adapters/agent/*`) — external agent implementations (Copilot CLI, Codex CLI, HTTP agent, custom test adapter).
- IO & shell (`src/io`) — centralized `runCommand` wrapper, safe defaults, env redaction.
- Patch & apply (`src/core/patches.ts`) — robust application of patches with transactional git fallbacks, `.rej` detection, and artifact recording.
- Progress (`src/core/progress.ts`) — atomic section writers for `progress.md`, next task acceptance criteria handling.

## Adapters

LLM adapters implement the `LLMAdapter` interface (see `src/types/adapters.ts`). They must provide a `generate` method that returns `{ text, raw }`.

Agent adapters implement `AgentAdapter` and provide `run({ prompt, cwd, env, timeoutMs })` returning `{ stdout, stderr, exitCode }`.

Current adapters
- `src/adapters/llm/openai.ts` — basic OpenAI Chat Completions wrapper using global `fetch`, supports `OPENAI_API_KEY` and `LLM_API_KEY`, with retries/backoff.
- `src/adapters/llm/openai-compatible.ts` — compatible with OSS LLM endpoints that use the completions format.
- `src/adapters/llm/vllm.ts` — (existing) adapter for local VLLM endpoints.
- `src/adapters/llm/passthrough.ts` — test-only adapter.

- `src/adapters/agent/http.ts` — production-capable HTTP adapter: expects POST JSON `{ prompt }` and normalizes responses `{ stdout, stderr, exitCode }` (also accepts `text` as stdout). Configure endpoint via `AGENT_HTTP_ENDPOINT` in env or adapter `env`.
- `src/adapters/agent/copilotCli.ts` — robust Copilot CLI wrapper; tries multiple invocation patterns and uses centralized `runCommand` for safety and testability.
- `src/adapters/agent/custom.ts` — test adapter used by contract tests.

Adapter guidance
- The HTTP agent should expose a small JSON API: POST / with { prompt }.
- The response schema should include `stdout`, `stderr`, and `exitCode` or `text` (will be normalized to `stdout`).
- Authentication: prefer Bearer tokens passed via `Authorization` header. The adapter accepts `AGENT_HTTP_ENDPOINT`—for more advanced setups, implement token rotation or per-run headers.

## Marker format and response types

Agents that produce file output should use the marker format in stdout:

=== path/to/filename.ext ===
<file contents>

Each marker opens a new file. Only well-formed markers are applied. Response types are configured with `AO_RESPONSE_TYPE` (`patches|files|commands|mixed`).

## Patch apply & `.rej` preservation

- Patches are applied using git when available. When `git apply --reject` produces `.rej` files, the orchestrator preserves those in the run artifacts:
  - Non-git: copy `.rej` into `.agent/runs/<runId>/rejections/` and record in `applied.marker`.
  - Git transactional failures: copy rejections to the OS temp runs dir for isolation and include relative paths in `applied.marker`.

This avoids leaving untracked `.rej` files in the working tree while preserving audit info.

## Progress.md and acceptance criteria

- `progress.md` is updated atomically by `src/core/progress.ts`. Sections include `Status`, `Clarifications`, `Decisions`, `Next Task`, and an inline checklist.
- `Next Task` includes `Acceptance Criteria` which are parsed and validated by `readNextTaskAcceptanceCriteria` and `validateAcceptanceCriteria` (basic trimming/filtering applied). For production, extend validation to enforce structured criteria.

## Locking & concurrency

- `src/core/locks.ts` implements an atomic lock file approach using `fs.open(..., 'wx')` to avoid races and writes PID + timestamp into the lock.
- Stale-lock detection: locks older than 5 minutes are considered stale and are recoverable (auto-unlinked). Make threshold configurable if needed.

## CLI helpers and artifacts inspection

- `show-run <runId>` — prints `.agent/runs/<runId>/run.json` for quick inspection.
- `list-rejections <runId>` — lists preserved `.rej` files under the run artifact.

## Environment flags and safe defaults

- `AO_ALLOW_COMMANDS` — must be explicitly set to `1` to permit running commands. Default is off to avoid accidental command runs in CI.
- `AO_DRY_RUN` — simulate command execution.
- `MOCK_RUN_COMMAND` — test hook that returns a JSON string to simulate command outputs.
- `AO_USE_LLM_GEN` — opt-in to LLM-based generation.
- `AO_LLM_PROVIDER` — choose the LLM adapter name.

## Tests & CI

- Unit & contract tests live under `tests/` and are executed using Vitest (`npm test`).
- CI workflow (`.github/workflows/ci.yml`) runs build, lint, typecheck, and tests on push/PR.

## Operational notes

- For production use, implement the following before trusting automation on main branches:
  - Proper LLM provider integration with secure secrets and retries.
  - Robust PR creation via Octokit (replace shell `curl` usage).
  - Stronger locking or external coordination for multi-run setups.
  - Retention policy for `.agent/runs` and `.rej` artifacts.

## Where to look in code

- CLI entry: `src/cli/index.ts`
- Orchestrator: `src/core/orchestrator.ts`
- Patch apply: `src/core/patches.ts`
- Progress: `src/core/progress.ts`
- Locks: `src/core/locks.ts`
- LLM adapters: `src/adapters/llm/*`
- Agent adapters: `src/adapters/agent/*`
- Tests: `tests/`

## Contact

If you need more changes or specific integration examples (e.g., GitHub App with Octokit, Kubernetes-based agent endpoints, or Vault-backed secrets), I can add examples.

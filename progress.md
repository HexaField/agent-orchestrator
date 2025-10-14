# Progress (implementation gaps and blockers)

This file lists outstanding implementation gaps, stubs, and placeholders that would prevent safe production use of the project. Each item below is written as a checklist so it can be tracked and completed.

## High-priority blockers

- [x] Implement a real automated code-review function (replace placeholder in `src/core/review.ts` with heuristics or LLM-assisted review; add tests).
	- Status: implemented. See `src/core/review.ts` — heuristics + optional LLM path added and covered by unit tests (`tests/unit/review-autoreview.spec.ts`, `tests/unit/review.spec.ts`). Tests pass in this environment.

- [ ] Replace/test agent adapters (`src/adapters/agent/*`) with production-ready adapters and document required binaries/credentials (Copilot, Codex, or HTTP agent endpoints).
	- Status: partially completed; split into subitems below.
	  - [x] HTTP adapter implementation added (`src/adapters/agent/http.ts`) — basic HTTP POST { prompt } -> { stdout, stderr, exitCode } normalization.
	  - [x] Copilot CLI adapter hardened (`src/adapters/agent/copilotCli.ts`) — uses centralized `runCommand`, multiple invocation fallbacks, and improved error diagnostics; covered by contract tests (`tests/contract/copilot-adapter.spec.ts`).
	  - [x] HTTP adapter integration test added (`tests/contract/http-agent.spec.ts`) — local stub verifies normalization.
	  - [ ] Docs for `AGENT_HTTP_ENDPOINT` (expected request/response, auth, examples) — TODO: add README section and examples.

- [ ] Add production-grade LLM provider integration (config, auth, retries, backoff, secrets handling, SDK adapters for OpenAI/VLLM/etc.).
	- Status: partially completed; split into subitems:
	  - [x] Basic OpenAI-compatible adapter implemented (`src/adapters/llm/openai.ts`) with retries/backoff and wired into adapter factory (`src/adapters/llm/index.ts`).
	  - [ ] Production polish: SDK-based adapters, secrets rotation, advanced backoff/retry, telemetry, and integration tests.

- [ ] Harden PR creation flow (`src/cli/commands/commit.ts`) — use GitHub SDK (`@octokit/rest`) or robust API client, improve remote parsing and error handling.
	- Status: not started.

## Medium-priority issues

- [x] Harden concurrency/locking (`src/core/locks.ts`) using atomic lock creation, stale-lock detection/recovery, and tests for concurrent runs.
	- Status: implemented basic atomic lock with stale-lock detection (5m) in `src/core/locks.ts`. Follow-ups: make threshold configurable and add concurrency tests.
- [x] Flesh out acceptance-criteria handling and partial-implementation semantics (`progress.md` schema, `src/core/evaluation.ts` tests + gating logic).
	- Status: partially implemented. `src/core/progress.ts` now validates acceptance criteria (`validateAcceptanceCriteria`) and writes Next Task section. More schema enforcement and gating tests remain.
- [ ] Implement repeated-failure detection/backoff and an escalation path to human reviewers when runs loop or fail repeatedly.
- [ ] Standardize `.rej` and other preserved artifact storage/retention policy (canonical location, retention/archival strategy, cross-platform behavior).

## Lower-priority / polish

- [ ] Document `runCommand` safety flags and security guidance in docs (AO_ALLOW_COMMANDS, AO_DRY_RUN, MOCK_RUN_COMMAND).
- [ ] Replace dangerous shell fallbacks with `fs-extra` usage and centralize artifact cleanup (`src/core/patches.ts` currently calls shell removal in places).
- [ ] Tune `src/core/evaluation.ts` signals and provide a tested LLM evaluation path (opt-in) with validation.
- [x] Add CLI helpers to inspect runs and preserved artifacts (e.g., `ao show-run <runId>`, `ao list-rejections <runId>`).
	- Status: implemented basic `show-run` and `list-rejections` commands under `src/cli/commands` and registered in the CLI.
- [ ] Update `project.md` mapping to mark implemented vs pending features and include environment/usage examples.
- [x] Add CI workflow and coverage targets (GitHub Actions) that run tests and typecheck with safe defaults.
	- Status: CI workflow exists at `.github/workflows/ci.yml` and runs build/lint/typecheck/tests; consider adding coverage collection as next step.

## Notes

- The test suite is comprehensive for the implemented paths and currently passes in this environment. The items above are primarily about production hardening, integration, and operational behavior.

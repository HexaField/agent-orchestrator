# Phase 1 Implementation Plan — Core Adapters & Task Loop

Status: Finalized (implementation plan)

## Scope

Phase 1 focuses on the minimal runtime required to accept a human-provided spec, produce an actionable plan, and execute atomic changes under a clarify-and-apply loop driven by an agent backed by local LLMs. The runtime pieces in scope are:

- AgentAdapter (initial provider: OpenCode) — an adapter that can manage agent sessions and perform filesystem & exec actions.
- LLMAdapters (initial providers: Ollama, vLLM) — adapters that call local LLM endpoints and return structured outputs used by the TaskLoop.
- TaskLoop — an orchestrator that iterates: prompt -> agent proposal -> clarification (if needed) -> apply atomic tasks -> record provenance.

This phase deliberately keeps UX, persistence, and multi-run orchestration minimal — the focus is a clean, testable runtime and provenance for every change.

## Objectives

- Implement an `AgentAdapter` that can start/stop sessions, send prompts, and (when permitted) create/edit/remove files and run CLI commands.
- Implement `LLMAdapter` wrappers for local LLM endpoints (Ollama and vLLM) that return both text and structured metadata (tokens used, citations, optional parsed tasks).
- Implement `TaskLoop` that consumes adapter responses and drives an apply/verify loop, producing step-level provenance.
- Provide TDD-aligned unit tests and at least one E2E-style test that runs locally and writes `.agent/run/<id>/` artifacts.

## Deliverables (Phase 1)

- `src/adapters/agent/opencode.ts` and `src/adapters/agent/opencode.test.ts` (AgentAdapter + tests).
- `src/adapters/llm/ollama.ts`, `src/adapters/llm/vllm.ts` and tests.
- `src/orchestrator/taskLoop.ts` (TaskLoop) and tests.
- `test/e2e/local-provider.test.ts` — an E2E flow that uses temporary directories and is gated by environment flags.
- Documentation: updated `docs/implementation/phase-1-implementation-plan.md` (this file) and a short `docs/getting-started.md` snippet linking to run instructions.

## Core Contracts (high-level)

The plan below includes concise TypeScript-style interface sketches that should be implemented in `src/adapters/*/interface.ts` files. Keep these contracts small and well-typed.

- AgentAdapter (contract sketch)

  - Inputs: session configuration, prompt text, limits
  - Outputs: structured response (text + optional parsed tasks), sessionId, status

  Contract example (to be implemented in-source):

  interface AgentAdapter {
    startSession(options: { title?: string; projectPath: string }): Promise<string>
    run(sessionId: string, input: string): Promise<{ text: string; tasks?: any[] }>
    stop(): Promise<void>
  }

- LLMAdapter (contract sketch)

  - Inputs: messages (system/user), optional context ids
  - Outputs: { text, tokensUsed?, citations? }

  interface LLMAdapter {
    call(messages: Array<{role: 'system'|'user'|'assistant'; content: string}>, opts?: {maxTokens?: number}): Promise<{text: string; tokensUsed?: number; citations?: any[]}>
  }

- TaskLoop (contract sketch)

  - Inputs: compiled prompt(s), adapters, run options
  - Outputs: step records, run summary, diffs/provenance

  interface TaskLoopResult {
    runId: string
    steps: Array<{id: string; adapter: string; input: any; output: any; applied?: boolean; provenance?: any}>
    summary: {success: boolean; errors?: string[]}
    artifactsPath: string // e.g. .agent/run/<id>
  }

  type TaskLoop = (opts: {spec: string; agent: AgentAdapter; llm: LLMAdapter; workDir: string; limits?: any}) => Promise<TaskLoopResult>

Implementation notes: keep the adapters thin — they should translate between the provider SDK and the small contracts above. The TaskLoop implements the orchestration and records the provenance in JSON files alongside applied diffs.

## Implementation Details

- Language: TypeScript (existing project). Keep code in `src/` and tests alongside implementation (`*.test.ts`).
- Tests: Jest. Write unit tests for each adapter and the TaskLoop first (TDD). Use small, deterministic fixtures.
- No environment variables for core config: adapters' constructors should receive configuration via parameters (e.g., host/port/path). Tests may use environment gating for real-provider E2E only.
- Use the OpenCode JS SDK for the OpenCode AgentAdapter. Where starting a provider process is required (OpenCode server), start it as a child process in tests and ensure cleanup.

AgentAdapter-specific note: The included `src/adapters/agent/opencode.ts` starts an opencode server via CLI and uses the SDK client. Keep the same approach but harden process management (time-outs, liveness checks, and proper kill).

## TaskLoop behaviour (detailed)

1. Prepare run environment: create `.agent/run/<random-id>/` and copy a snapshot of `spec.md` and initial `workDir` listing.
2. Start an agent session (AgentAdapter.startSession).
3. Build a prompt from `spec.md` and run AgentAdapter.run(session, prompt).
4. Parse agent response for tasks. If tasks are present, attempt to apply them atomically (file diffs and exec commands).
5. For each applied atomic change, store a provenance record with:
   - timestamp
   - adapter name + call args
   - diff (unified diff)
   - command stdout/stderr (if exec)
   - commit-id (optional — not a git commit, just an artifact id)
6. Re-prompt agent with results (success/failure) and loop until agent signals `stop` or a configured iteration limit is reached.

Keep atomic apply operations idempotent where possible. If a file already matches the intended change, record it as a no-op apply with provenance.

## Provenance format

Each step produces a JSON entry stored under `.agent/run/<id>/provenance/<seq>-<adapter>.json` with:

- id: string
- timestamp: ISO
- adapter: string
- type: 'diff' | 'exec' | 'llm-call' | 'session'
- input: object (sanitized call args)
- output: object (sanitized results)
- diff?: string (unified diff)
- stdout?: string
- stderr?: string

This keeps run artifacts inspectable and scriptable.

## Tests & E2E guidance

- Unit tests: small, fast, no external processes. Mock the LLM adapters and the opencode client to verify TaskLoop orchestration.
- Integration tests: start a real OpenCode server (or mock a minimal HTTP shim) to verify `opencode.ts` behaviour. Keep these gated by an environment variable (e.g., `TEST_REAL_PROVIDERS=true`) so CI can opt-in.
- E2E test (local): create a temporary directory with a trivial `spec.md` and a minimal repo layout. Run the TaskLoop with real adapters and assert that `.agent/run/<id>/` contains expected provenance files and that applied files match the agent's intended changes. Use Node's `fs.mkdtempSync()` and `os.tmpdir()`.

Test examples (conceptual):

- Unit: `src/adapters/agent/opencode.test.ts` — mock the `createOpencodeClient` calls and the child process spawn; assert `startSession()` returns id, `run()` returns text.
- Integration/E2E: `test/e2e/local-provider.test.ts` — spawn opencode server, run TaskLoop, assert artifacts.

## How to run locally (developer guide)

These are suggested commands you can run during development. They assume you are in the repo root and have Node + npm installed.

1) Install dependencies

```bash
npm install
```

2) Run unit tests (fast)

```bash
npm test -- --watchAll=false
```

3) Run E2E with real providers (optional, gated)

Always run the real providers.

4) Inspect a run artifact

After a successful run the TaskLoop writes to `.agent/run/<id>/`; open `provenance/` inside that directory to inspect JSON provenance files and `applied/` for changed files.

## Acceptance Criteria (Phase 1) — mapping to tests & artifacts

- PASS: AgentAdapter implemented and covered by unit tests (happy path + error handling). (Check: `src/adapters/agent/opencode.test.ts` PASS)
- PASS: LLMAdapters implemented with unit tests that mock network/SDK calls. (Check: `src/adapters/llm/*.test.ts` PASS)
- PASS: TaskLoop implemented with unit tests covering orchestration and provenance recording. (Check: `src/orchestrator/taskLoop.test.ts` PASS)
- PASS: E2E test runs locally and produces `.agent/run/<id>/` with at least one `provenance/*.json`. (Check: `test/e2e/local-provider.test.ts` PASS when `TEST_REAL_PROVIDERS=true`)

Quality gates to run before marking done:

- Build: TypeScript compile (tsc) — ensure no type errors in changed files.
- Lint: (project doesn't enforce a linter in Phase 1, but run a quick check if configured).
- Tests: jest runs with all unit tests passing; E2E gated.

For each gate above, the test harness should return PASS or FAIL and any failing artifacts should be fixed before merging.

## Implementation checklist (short)

- [x] Draft plan and scope (this file)
- [x] Add `opencode.ts` (agent adapter) — (already implemented)
- [ ] Add unit tests for `opencode.ts` and mock client
- [ ] Add `llm` adapters and tests
- [ ] Implement `TaskLoop` with provenance writing
- [ ] Add E2E test that writes `.agent/run/<id>/`
- [ ] Run quality gates and iterate until PASS

## Next steps and small-risk extras

- Implement the interface files `src/adapters/agent/interface.ts` and `src/adapters/llm/interface.ts` (small files, high value).
- Add a tiny README snippet in `docs/` that explains how to run the local E2E (copy of 'How to run locally' above).
- Add a Jest helper `test/utils/tmpdir.ts` to standardize temporary-dir creation and cleanup across E2E tests.

## Notes and assumptions

- This plan assumes local-only LLM providers for Phase 1. If cloud providers are later needed, adapters should implement the same contracts so TaskLoop remains provider-agnostic.
- Adapter constructors accept explicit configuration objects (no environment variables for required config). Tests may rely on env gating for optional real-provider runs.
- The OpenCode adapter will manage its CLI server process; tests must ensure proper teardown to avoid orphaned processes.

---

If you'd like, I can now:

- Create the `src/adapters/*/interface.ts` files with the TypeScript interfaces above and small unit-test skeletons.
- Implement a minimal `src/orchestrator/taskLoop.ts` stub and unit tests to validate the orchestration loop.

Tell me which of those you'd like me to implement next and I'll add a focused todo and start editing files.

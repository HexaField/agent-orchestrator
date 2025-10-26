# Phase 1 Progress Checklist — Core Adapters & Task Loop

This file is a tracked, actionable checklist derived from `phase-1-implementation-plan.md`. It lists implementation tasks, file paths, and the required test files placed next to each implementation file (TDD-first).

Format:

- Item — Short description
  - Implementation file(s)
  - Test file(s) (next to implementation)
  - Acceptance criteria / notes

## Top-level goals

- Implement agent and LLM adapters, task loop, provenance, and tests so `npm test` runs locally.
- All adapter calls should target local-only LLMs (ollama | vllm) or the Agent adapter when configured.
- No environment variables for configuration; pass config via parameters.

---

## Checklist

- [ ] 1. Type Interfaces

- Define any adapter/orchestrator types.
  - Guidance:
    - Place type definitions alongside implementation files (for example, export types from `src/adapters/agent/opencode.ts`).
    - Tests that validate shapes should live next to implementation files (e.g., `src/adapters/agent/opencode.test.ts`).
  - Acceptance:
    - Implementation files export the required input/output shapes (sessionId, messages, tasks, tokensUsed, citations, provenance events) and adjacent tests validate minimal example objects against these shapes.

- [ ] 2. AgentAdapter (OpenCode) implementation

- Implement the OpenCode-based AgentAdapter that can accept messages and produce tasks and FS/Exec operations.
  - Files:
    - `src/adapters/agent/opencode.ts`
  - Tests:
    - `src/adapters/agent/opencode.test.ts`
  - Acceptance:
    - Adapter exposes methods matching the agent interface.
    - Unit tests mock the OpenCode SDK and assert outputs (messages, tasks, control signals).

- [ ] 3. Agent-as-LLM wrapper

- Wrap an AgentAdapter so it can be used as an LLM source (for agent-in-the-loop feedback).
  - Files:
    - `src/adapters/llm/agentAsLLM.ts`
  - Tests:
    - `src/adapters/llm/agentAsLLM.test.ts`
  - Acceptance:
    - Implements the `LLMAdapter` interface and forwards/frames messages to the AgentAdapter.

- [ ] 4. LLMAdapter implementations

- Ollama adapter (local REST target).
  - Files:
    - `src/adapters/llm/ollama.ts`
  - Tests:
    - `src/adapters/llm/ollama.test.ts` (HTTP mocks)
  - Acceptance:
    - Exposes a function that accepts system/user messages and returns text, tasks (if any), tokensUsed, and citations. Tests mock HTTP calls and confirm correct parsing of responses.

- vLLM adapter (OpenAI-compatible local endpoint).
  - Files:
    - `src/adapters/llm/vllm.ts`
  - Tests:
    - `src/adapters/llm/vllm.test.ts` (HTTP mocks)
  - Acceptance:
    - Compatible call shape for OpenAI-like responses and returns LLMAdapter-shaped outputs. Tests verify header/endpoint usage and output shape.

- [ ] 5. TaskLoop / Action loop

- Implement the orchestrator loop that coordinates agent proposals, clarifications, and applies atomic changes.
  - Files:
    - `src/orchestrator/actionLoop.ts`
    - `src/orchestrator/runner.ts`
  - Tests:
    - `src/orchestrator/actionLoop.test.ts`
    - `src/orchestrator/runner.test.ts`
  - Acceptance:
    - The loop supports iteration limits, control signals (clarify/stop), and produces step records with provenance events.

- [ ] 6. Provenance & recording

- Central provenance recorder to capture diffs, commands run, and adapter calls per run.
  - Files:
    - `src/orchestrator/provenance.ts`
  - Tests:
    - `src/orchestrator/provenance.test.ts`
  - Acceptance:
    - Records serialized events to `.agent/run/<id>/provenance.json` (or similar). Tests should use temp run directories and assert recorded events match emitted events.

- [ ] 8. E2E-style test

- Minimal end-to-end test that runs TaskLoop against a simple spec and checks artifacts.
  - Files:
    - `test/e2e/simple-spec-run.test.ts`
  - Acceptance:
    - Runs in a temp directory, uses mock or real adapters (gated). Asserts `.agent/run/<id>/` exists and includes provenance and run summary.

---

## E2E gating and environment

- E2E tests must run real LLM endpoints.
- Note: Phase 1 plan requires local-only providers (ollama/vllm/agent). Do not call external hosted LLMs in Phase 1 E2E tests.

---

## How to run tests (developer quick commands)

# Run unit tests only

npm test

# Run E2E tests (gated; see doc for enabling real providers)

npm run test:e2e

---

## Mapping to phase-1-implementation-plan.md

This checklist follows the structure and acceptance criteria in `docs/implementation/phase-1-implementation-plan.md`. Use it as the canonical implementation checklist for Phase 1.

---

## Completion log

- Created: `docs/implementation/phase-1-progress.md`
- Next recommended action: Implement the AgentAdapter (OpenCode) and its unit tests (items 2 and 3 in this checklist).

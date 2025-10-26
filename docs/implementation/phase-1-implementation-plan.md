# Phase 1 Implementation Plan — Core Adapters & Task Loop

Status: Draft

## Scope

Phase 1 focuses on the core runtime pieces that enable agentic decisions and LLM-driven interactions: the AgentAdapter (a fully-capable coding agent), the LLMAdapter (local LLM endpoints), and the TaskLoop which coordinates proposals and actionable changes.

These components form the minimal runtime required to: accept a spec, produce an actionable plan, and execute atomic changes (with provenance) under an orchestrated clarify loop.

## Objectives

- Provide an AgentAdapter that can create/edit/remove files, run CLI commands, and maintain an agent session per run.
- Provide LLMAdapters for local-only LLM runtimes (initially Ollama and vLLM) and support invoking an agent-as-feedback as an LLM source.
- Implement the TaskLoop that coordinates agent proposals, clarifications, application of atomic tasks, and recording of events.
- Produce provenance for every actionable change (diffs, commands run, LLM calls).

## Deliverables (Phase 1)

- `AgentAdapter` implementation (OpenCode adapter) and tests.
- `LLMAdapter` implementations for Ollama and vLLM and tests.
- `TaskLoop` implementation that drives run iterations and records step-level provenance.
- Tests: unit tests for each module and at least one E2E-style test exercising task flow (local-only requirements apply).

## Core Contracts (high-level)

- AgentAdapter
  - Inputs: system/user messages, sessionId, limits
  - Output: messages, tasks, control signals (clarify/stop), sessionId
  - Behavior: permitted to perform FS/Exec operations directly.

- LLMAdapter
  - Inputs: system/user messages, context ids
  - Output: text, tasks, tokensUsed, citations
  - Constraint: must target local endpoints only when used by the orchestrator (ollama|vllm) or `agent` adapter when configured.

- TaskLoop
  - Inputs: compiled prompt(s), adapters, verify plan, limits
  - Output: step records, result summary, diffs, provenance events

## Development Approach

- Language: TypeScript
- Tests: Jest (TDD-first: tests next to implementation files, `*.test.ts`)
- Runtime: Node.js

Follow strict TDD for each new module — tests must be created before or alongside implementations.

## API Design

- A single export for each module, which exposes a function or set of functions where applicable
- Use interfaces/types to define input/output contracts clearly
- Use a pure functional declarative paradigm

## Implementation Details

- Must use the OpenCode JS SDK for the OpenCode AgentAdapter to run a server and
- Must not rely on environmental variables for configuration; all config must be passed via method parameters.

## E2E Considerations (Phase 1)

- E2E tests must use temporary directories and be isolated from the repo.
- LLM and Agent adapters should have at least one real-provider integration test gated by environment.

## Acceptance Criteria (Phase 1)

- AgentAdapter, LLMAdapter(s), and TaskLoop implemented with tests and runnable `npm test`.
- Ability to run a task loop against a simple `spec.md` and persist a run artifact under a temp `.agent/run/<id>/`.
- Provenance/logging of tasks, diffs, and adapter calls for review.

## Project Structure

```
.
├─ .agent/                           # runtime state (created at run-time)
│  ├─ run/<id>/                      # per-run artifacts
│  └─ memory/                        # persistent summaries
├─ src/
│  ├─ orchestrator/                  # policy-driven orchestration (clarify loop)
│  │  ├─ runner.ts
│  │  ├─ actionLoop.ts
│  ├─ adapters/                      # neutral interfaces + implementations
│  │  ├─ llm/
│  │  │  ├─ interface.ts
│  │  │  ├─ ollama.ts                # local REST API
│  │  │  └─ vllm.ts                  # OpenAI-compatible local endpoint
│  │  ├─ agent/
│  │  │  ├─ interface.ts
│  │  │  └─ opencode.ts              # initial agent provider support
|- test/
│  └─ e2e/                           # end-to-end tests with real providers
├─ package.json
├─ tsconfig.json
└─ README.md
```

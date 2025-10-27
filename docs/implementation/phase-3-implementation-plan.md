# Phase 3 Implementation Plan — Iterative Feedback & Steering

Status: In progress — core feedback engine implemented, tests added

## Scope

Replace the single yes/no LLM judge in `runTaskLoop` with a compact FeedbackEngine that returns a structured per-iteration report (verdict, issues, steering suggestions, confidence). This enables actionable, auditable feedback and safe auto-steering.

Touches: `src/orchestrator/taskLoop.ts`, new `src/orchestrator/feedback.ts`, and tests/provenance.

## Key objectives

- Provide `analyzeIteration(runId, iteration, task, agentOutput, ctx): Promise<FeedbackReport>`
- Persist `<iter>-feedback.json` to provenance (sanitized)
- Keep `TaskLoop` backward-compatible by deriving `summary.success` from feedback verdicts

## Minimal FeedbackReport (required fields)

- verdict: 'complete'|'partial'|'incomplete'|'fail'
- confidence: number (0..1)
- rationale: string
- issues: [{ id, type, severity, message, evidence? }]
- steering: [{ id, type, description, safe, patch?|command? }]

## Deliverables

- `src/orchestrator/feedback.ts` (types + `analyzeIteration` + small prompt templates)
- Update `src/orchestrator/taskLoop.ts` to call feedback, persist files, and add `f-<i>` steps
- Unit tests for parsing/heuristics and integration tests asserting feedback files

## Safety & observability

- Record durations, confidence, and evidence in provenance; always scrub secrets.

## Tests & rollout

- Unit: parse malformed/valid LLM responses and parsing heuristics

# Integration: stub LLM to return `complete` and assert `<iter>-feedback.json` and `summary.success`

## Next steps

1. Implement `feedback.ts` scaffold + unit tests
2. Wire into `taskLoop.ts`, persist feedback, add step entry
3. Add integration tests

Completion: this is a compact plan to add structured per-iteration feedback, safe steering, and provenance for TaskLoop.

## Implementation status (quick)

- `src/orchestrator/feedback.ts`: implemented (parsing, heuristics, duration metric)
- `src/orchestrator/feedback.test.ts`: unit tests present (parsing + fallback heuristics)
- `test/integration/feedback.integration.test.ts`: integration test added (stubs LLM/agent, asserts provenance file and summary)

Next: run CI/tests and iterate on steering actions parsing and safety checks.

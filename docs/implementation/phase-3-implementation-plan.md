# Phase 3 Implementation Plan — Iterative Feedback & Steering

Status: Draft

## Scope

Replace the single yes/no LLM judge in `runTaskLoop` with a compact FeedbackEngine that returns a structured per-iteration report (verdict, issues, steering suggestions, confidence). This enables actionable, auditable feedback and optional safe auto-steering.

Touches: `src/orchestrator/taskLoop.ts`, new `src/orchestrator/feedback.ts`, and tests/provenance.

## Key objectives

- Provide `analyzeIteration(runId, iteration, task, agentOutput, ctx): Promise<FeedbackReport>`
- Persist `<iter>-feedback.json` to provenance (sanitized)
- Keep `TaskLoop` backward-compatible by deriving `summary.success` from feedback verdicts
- Gate any auto-applied steering behind `opts.enableAutoSteer` and `AGENT_AUTO_STEER` env flag

## Minimal FeedbackReport (required fields)

- verdict: 'complete'|'partial'|'incomplete'|'fail'
- confidence: number (0..1)
- rationale: string
- issues: [{ id, type, severity, message, evidence? }]
- steering: [{ id, type, description, safe, patch?|command? }]

## Deliverables

- `src/orchestrator/feedback.ts` (types + `analyzeIteration` + small prompt templates)
- Update `src/orchestrator/taskLoop.ts` to call feedback, persist files, and add `f-<i>` steps
- Unit tests for parsing/heuristics and integration tests asserting feedback files, gating, and backward compatibility

## Safety & observability

- Never auto-apply unsafe edits by default. Auto-steer only when `enableAutoSteer===true` and `AGENT_AUTO_STEER=true`.
- Record durations, confidence, and evidence in provenance; always scrub secrets.

## Tests & rollout

- Unit: parse malformed/valid LLM responses, `isOutOfScope` checks
- Integration: stub LLM to return `complete` and assert `<iter>-feedback.json` and `summary.success`
- Keep destructive tests gated behind env flags

## Next steps

1. Implement `feedback.ts` scaffold + unit tests
2. Wire into `taskLoop.ts`, persist feedback, add step entry
3. Add integration tests and run CI with auto-steer disabled

Completion: this is a compact plan to add structured per-iteration feedback, safe steering, and provenance for TaskLoop.

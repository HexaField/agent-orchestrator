# Phase 7 Implementation Plan — Acceptance-Criteria Mapping, Reviewer Reports & Cross-Run Orchestration

Status: Draft

## Scope

Phase 7 implements a bidirectional mapping between acceptance criteria and verification functions, improves reviewer-oriented reports and approval metadata, and adds cross-run orchestration capabilities (aggregation, promotion, and dependency wiring across runs). This phase strengthens correctness guarantees and reviewer workflows.

In-scope:

- A verification rule registry and acceptance-criteria DSL that maps human-readable acceptance criteria to executable verification functions.
- A richer report schema oriented at reviewers with approval metadata, traceability, and remediation hints.
- Cross-run orchestration primitives: run aggregation, promotion of artifacts between runs, and linking dependent runs without scheduling semantics.
- Tests and end-to-end examples that exercise mapping from criteria → verification → report → reviewer decision.

## Objectives

- Define an acceptance-criteria schema and a registry where each criterion binds to one or more verification functions (commands or adapters).
- Provide tooling to author and validate acceptance criteria and to auto-generate the verification plan used by `VerificationEngine`.
- Produce reviewer-oriented reports that include approval metadata, remediation guidance, and end-to-end traceability to prompts and provenance.
- Implement cross-run orchestration APIs to link runs, collect roll-up reports, and promote artifacts (e.g., a verified patch) from one run to another.

## Acceptance-Criteria → Verification mapping

Design goals:

- Make acceptance criteria declarative and human-readable while being mappable to executable checks.
- Support simple criteria (e.g., `lint:pass`) and composed criteria (e.g., `allOf(lint:pass, tests:coverage>80)`).

Schema (conceptual JSON-like):

```json
{
  "id": "criterion-id",
  "description": "Must pass TypeScript compile",
  "type": "command|script|verifier",
  "verifier": { "adapter": "exec", "cmd": "npm run build --silent" },
  "onFailure": { "severity": "block|warn", "message": "Type errors present" }
}
```

Registry & runtime:

- A `VerifierRegistry` stores named verifiers (shell commands, Node-based checks, or adapter-backed checks) and exposes `planForCriteria(criteria[])` which emits a verification plan for `VerificationEngine` to run.
- Verification functions return structured results: { name, status, outputPath, durationMs, metadata } and are storable as provenance artifacts.

Authoring & validation:

- Provide a small CLI `agent-orchestrator verify:compile --criteria file.json` that validates criteria schema and simulates the verification plan (dry run).

## Reviewer-oriented reports & approval metadata

Purpose: make it effortless for reviewers to understand the rationale, evidence, and approvals for each change.

Report schema additions:

- `approval` block: who approved what and when, with optional reviewer roles (e.g., `security`, `tech-lead`).
- `remediationHints`: structured suggestions returned when checks fail (e.g., `run: npm run lint` or `files: src/foo.ts`).
- `trace` entries: pointers from report sections back to prompts, context-pack excerpts, and provenance artifacts.

Example `report.summary` snippet:

```json
{
  "title": "Add logging to agent",
  "approval": { "required": ["tech-lead"], "approvedBy": [{ "user": "alice", "role": "tech-lead", "at": "..." }] },
  "verification": { "checksPassed": 5, "checksFailed": 0 },
  "remediationHints": []
}
```

Report generation behavior:

- Reports assemble per-task evidence: diffs, verification outputs, and a short machine-extracted rationale.
- Reports include an `approval` summary for quick scanning and a per-task approval table.

Approval metadata & immutability:

- Approval actions write to `progress.log` and are included in the run's immutable provenance. The `report.summary` includes a canonical `approvalSnapshot` that captures the approval state at the time of commit/PR creation.

## Cross-run orchestration (no scheduling)

Purpose: allow runs to relate and compose outputs (e.g., a design run feeding an implementation run) without introducing a scheduler.

Key primitives:

- `linkRuns(parentRunId, childRunId, relationType)` — records dependency and semantic relation (e.g., `implements`, `updates`, `depends_on`).
- `promoteArtifact(runId, artifactPath, targetRunId)` — copy or reference artifacts from one run into another for reuse (e.g., reuse compiled summaries or a validated patch).
- `aggregateReports(runIds[])` — produce a roll-up report merging verification and approval metadata across runs.

Use-cases:

- Design review runs produce an agreed spec that seeds an implement-spec run; `linkRuns` makes the relation explicit and retrievable.
- A hotfix run can promote a patch into a release-run candidate via `promoteArtifact`.

Consistency and provenance:

- All cross-run operations append provenance events and are recorded under `.agent/run/<id>/crossrun.json` with timestamps and user metadata.

APIs and CLI:

- `agent-orchestrator run:link --from <run> --to <run> --relation implements`
- `agent-orchestrator run:promote --run <source> --artifact <path> --target <run>`

## Tests & validation

- Unit tests for `VerifierRegistry` mapping sample criteria to executable plans.
- Integration tests that run an example criteria set against a sample repo and assert expected verification outputs.
- Cross-run tests: link two runs and verify `aggregateReports()` includes data from both runs and that provenance references are valid.

## Acceptance Criteria (Phase 7)

- Acceptance criteria can be authored and validated with the provided schema and CLI; `VerifierRegistry` produces an executable verification plan.
- Reports include explicit approval metadata and `approvalSnapshot` is included in provenance for commits/PRs.
- Cross-run primitives (`linkRuns`, `promoteArtifact`, `aggregateReports`) function and produce provenance traces linking related runs.

## Next steps and small-risk extras

- Provide a visual report comparator in the web UI to compare aggregated run reports.
- Add role-based reviewer policies to require specific role approvals for certain criteria (e.g., security tests must be approved by `security` role).

---

If you'd like, I can implement the `VerifierRegistry` and a small example mapping file plus unit tests next.

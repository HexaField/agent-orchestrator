# ADR 0001: Development Phases and Agent Clarify Loop

## Status

Proposed

## Context

The project aims to deliver an orchestrated, verifiable engineering agent system that operates over neutral tool interfaces (LLM, KMS, VCS, execution) with a policy-driven orchestrator that composes them. Early focus must validate end-to-end autonomy on a single specification, demonstrating a bounded run/clarify/review loop that can reason, edit, verify, and summarize with human oversight at defined checkpoints.

## Decision

Adopt a phased development roadmap centered on an initial “agent clarify loop” capability and incrementally expand orchestration, verification, integrations, and governance. Each phase should preserve auditability, provenance, and neutral integrations while evolving orchestration policies and UX.

### Phase 1 — Agent Clarify Loop

Goal: Implement fully autonomous execution of a single plan/spec document within a bounded loop: run → clarify → review.

- Reads a single spec/plan document and constructs a context pack.
- Compiles prompts with clear output schemas and executes atomic actions.
- Iteratively asks clarifying questions (to the user or a clarifier role) when ambiguity is detected and records answers in run context.
- Performs edits via the agent and logs diffs, commands, and outcomes.
- Produces a session report with decisions, diffs, and run metadata for human review.
- Persists artifacts under `.agent/run/<id>/` and a summary in `.agent/memory/`.

Success criteria:

- Demonstrate at least one non-trivial change application from the spec and record complete provenance.
- Show clarify prompts only when necessary, minimizing unnecessary queries.
- Provide a reproducible run record and a concise summary suitable for review.

### Phase 2 — Integrations and PR Workflow

Goal: Move from local-only to integrated VCS workflows and basic knowledge reuse.

- Add branch/commit/PR creation via neutral VCS connectors.
- Attach verification reports and changelog to PRs.
- Introduce basic KMS retrieval/publish for lessons learned and reusable snippets.
- Harden diff scope checks to avoid unrelated edits.

- Add Verification and Checks: run automated checks, map acceptance criteria, and surface structured reports.
- Add richer Observability: structured logs, metrics, and traces for runs and verification.
- Harden VCS workflows: commit/branch defaults, commit templates, and PR attachments.
- Define security and privacy guardrails for outbound calls and log retention policies.
- Define performance SLOs and run-time limits; add retries and flake handling for verification.

### Phase 3 — Phase-Aware Policies and Acceptance Mapping

Goal: Make orchestration policies explicit per working mode and tie acceptance criteria to verifications.

- Enforce mode-specific tools and access (read-only vs write) with clear guardrails.
- Map acceptance criteria to concrete verification steps with pass/fail linkage.
- Enhance context ranking and budget management to avoid context sprawl.

### Phase 4 — Multi-Language Verification Presets and Observability

Goal: Serve common stacks with out-of-the-box verification and richer visibility.

- Provide presets for popular languages and frameworks (lint/typecheck/test runners).
- Add structured logs, metrics, and traces across phases and actions.
- Improve flake handling with timeouts, retries, and resumable sessions.

### Phase 5 — Governance, Provenance, and Policy Authoring UX

Goal: Strengthen trust, safety, and evolvability.

- Expand provenance: tie prompts, context, actions, and results via metadata.
- Configurable data retention, privacy controls, and export.
- User-authorable policies for orchestration (e.g., verify gates, clarify heuristics, context sources).

### Phase 6 — Advanced Knowledge Integration and Cross-Run Learning

Goal: Turn outputs into reusable knowledge assets and leverage them automatically.

- Publish distilled postmortems and standards to shared KMS.
- Tag reasoning/code snippets with a consistent taxonomy for retrieval.
- Cross-run retrieval to accelerate future similar tasks.

## Consequences

- Early value is demonstrated with a focused clarify loop before expanding integrations.
- The modular foundation enables swapping tools without changing orchestration policies.
- Strong verification and provenance increase trust but require disciplined logging and storage.
- Phase gating manages risk and provides clear checkpoints for review and iteration.

## Alternatives Considered

- Big-bang implementation of all phases at once: rejected due to risk and lack of incremental validation.
- Tight coupling to a single vendor stack: rejected to avoid lock-in and preserve evolvability.

## Open Questions

- Which clarify heuristics should trigger questions vs proceed with assumptions?
- What default verification presets should be provided first by language and framework?
- How should PR templates balance brevity with completeness for reviewer efficiency?
- What privacy/retention defaults are appropriate for run logs and artifacts?
- What taxonomy for knowledge assets best supports cross-run retrieval?

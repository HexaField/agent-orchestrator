# Agent Orchestrator — Product Requirements Document (PRD)

## Overview

The Agent Orchestrator is a context-aware system that plans, composes, executes, verifies, and integrates software engineering work using LLM-powered agents. It manages end-to-end runs from spec to verified implementation over stable tool interfaces, preserving provenance, auditability, and learnings.

## Goals

- Deliver a predictable, auditable loop from specification to verified code changes.
- Bound agent cognition via phases and curated context to reduce risk and cost.
- Provide objective verification (lint, typecheck, tests, diffs) before human review.
- Persist session artifacts, reasoning, and decisions for transparency and reuse.
- Integrate learnings into a knowledge base to improve future runs.

## Non-Goals

- Building a new LLM or training models from scratch.
- Replacing human review entirely; humans remain in the approval loop.
- Managing deployment/ops beyond producing verified PRs.

## Target Users and Personas

- Backend/Frontend Engineers: offload repetitive or structured implementation tasks.
- Tech Leads/Reviewers: require traceable, verifiable diffs and reports.
- Eng Managers/Program Managers: want measurable progress and reliability.

## Key Use Cases

- Implement a scoped change from a spec with automatic verification and PR creation.
- Refactor with safety checks and diff analysis to prevent scope creep.
- Document and summarize decisions across runs, feeding a shared KMS.

## Scope

- In-scope: Orchestration lifecycle, context assembly, prompt compilation, agent session control, verification, human review gate, commit/PR, session summary, integrations via neutral adapters (LLMs, KMS, VCS), governance/provenance.
- Out-of-scope: Production deployment pipelines, secret management backends (beyond integration), vendor-specific IDE plugins.

## Phases of Work (Operating Modes)

- New-Spec: exploratory research and requirements gathering.
- Create-Spec: design, architecture, planning.
- Implement-Spec: coding, verification, commits/PRs.
- Defaults to Implement-Spec if unspecified.

## Functional Requirements

1. Initialization — Establish Working Universe

- Read initiating files (e.g., spec.md, progress.md) when present.
- Create `.agent/` directory structure for runs, memory, and artifacts.
- Index the repository for search/retrieval.
- Connect to configured LLM(s) and Knowledge Management System (KMS) through interchangeable adapters.
- Load identity/role context and persistent memory from previous runs.
- KMS is out of scope for initial implementation.

2. Phase Definition — Choose Work Mode

- Allow user to select phase or auto-detect based on context.
- Adjust enabled tools, access level (read-only vs write), and prompting style per phase, composing behavior atop neutral interfaces.
- Phase transitions are not allowed mid-run; each run is tied to a single phase to maintain clarity and consistency in behavior.

3. Context Assembly — Build the Cognitive Frame

- Construct a ranked context pack from immediate, persistent, and external sources.
- Filter to relevant snippets; cap size to budget while preserving citations.
- Maintain retrieval provenance for each context element.
- Retrieval uses stable KMS/search adapters; selection and shaping remain policy-driven.
- Token & context budget is unbounded for now.

4. Prompt Compilation — Translate Context into Intent

- Generate structured prompts with:
  - System message (role, tools, constraints)
  - User message (context pack, checklists, references)
  - Optional few-shot examples
  - Output schema (e.g., "patch, then test plan, then summary")
- Make prompt structure reproducible and debuggable, independent of specific tool vendors.

5. Agent Session — Persistent Action Loop

- Execute bounded, resumable sessions where the agent can read, write, run tests, and ask clarifications.
- Perform atomic actions with diffs and command logs captured per step.
- Persist full session record with timestamps and artifacts in `.agent/run/*`.
- Execution interacts with tools through swappable adapters; sequencing and guardrails are orchestrated.
- No maximum runtime or idle timeout for now, but we must detect when sessions hang indefinitely (with hard coded situations for now, such as unterminated terminal quotes or terminal prompts).

6. Verification — Objective Grounding

- Run automated checks: lint, typecheck, tests, static analysis, and diff scope checks.
- Link acceptance criteria to explicit verification functions.
- Block progression on failures; surface actionable diagnostics.
- Verification tools are pluggable; mapping rules live in orchestration policies.
- Linters & typecheckers are defined by the user via configuration as terminal commands.

7. Review and Approval — Human-in-the-Loop

- Present diffs, verification results, and rationale for human review.
- Support change requests that feed back into the next session iteration.

8. Commit and Integration — Merge the Work

- Generate a changelog summarizing changes and rationale.
- Create a branch and commit tied to `.agent/run` metadata.
- Optionally open a pull request with verification/report artifacts attached.
- Source control operations go through VCS adapters; strategy and timing are orchestrated.
- Radicle, Github, GitLab, and Bitbucket are targeted initially.

9. Session Summarization — Compress Learnings

- Produce a concise narrative of decisions, tradeoffs, constraints, and open questions.
- Store summaries in `.agent/memory/` for retrieval in future runs.

10. Knowledge Integration — Learn Beyond the Project

- Publish distilled lessons to a shared KMS (standards, runbooks, postmortems).
- Tag reusable reasoning/code snippets for retrieval.

11. Continuous Evolution — Context as an Ecosystem

- Support within-session, cross-run, and cross-system learning loops.
- Implement structured forgetting: retain reusable knowledge; trim noise.

12. Governance, Safety, and Explainability

- Log every input/action/output with provenance metadata.
- Provide traceability from changes back to prompts and verification.
- Ensure runs are auditable, restartable, and compliant.

## System Interactions and Architecture (High-Level)

- Orchestrator: composes phases, assembles context, compiles prompts, supervises sessions with policy.
- Agent Runtime: executes actions (read/write files, run checks), records diffs/logs via stable interfaces.
- Verification Engine: runs linters/tests/typecheckers and maps acceptance criteria through adapters.
- Review Gateway: presents artifacts for approval, captures feedback.
- Integration Layer: neutral connectors for git/PRs, KMS, identity/roles, storage for `.agent/*`.

## Data and Storage

- `.agent/run/<id>/`: session logs, diffs, command outputs, reports.
- `.agent/memory/`: summaries and learned artifacts.
- Configuration: connections (LLM/KMS/VCS) via adapters, phase policies, verification settings.

## Security and Compliance

- Secrets never logged; redaction where unavoidable.
- Principle of least privilege for filesystem and VCS operations.
- Configurable data retention and export for compliance.

## Performance and Reliability

- Fast startup: initialization and indexing under target thresholds.
- Deterministic prompt assembly with stable ordering and citations.
- Timeouts and retries for flaky checks; resumable sessions on crash.

## Observability

- Structured logs for actions, errors, and timings.
- Metrics: run duration, verification pass rate, edit scope growth, cost usage.
- Traces across phases for end-to-end visibility.

## UX and Outputs

- Human-readable session report with:
  - Summary, decisions, and diffs
  - Verification results and checklist coverage
  - Links to artifacts and provenance
- Changelog and PR description templates.

## Milestones

- M1: Minimal orchestration loop (Init → Session → Verify → Report), local-only, manual review.
- M2: Branch/commit/PR integration, basic KMS, session summaries, provenance.
- M3: Phase-aware policies, acceptance-criteria mapping, diff scope checks.
- M4: Multi-language verification presets, richer observability, PR templates.

## Risks and Mitigations

- Context sprawl → Strict phase scoping, ranked/filtered context packs, budget caps.
- Unreliable verification → Start with widely used tools; add adapters and golden tests.
- Overreach edits → Diff-scope checks and human review gates.
- Vendor lock-in → Pluggable LLM/KMS/VC layers with clear interfaces.

## Acceptance Criteria

- A user can run the orchestrator to produce a verified change with:
  - A reproducible session record in `.agent/run/<id>/`.
  - Verification report showing checks run and pass/fail per criterion.
  - A human-readable summary and rationale.
  - Optionally, a branch/commit or PR with attached artifacts.
- Configuration allows selecting phase, tools, and verification presets per language.
- All actions include provenance metadata referencing prompts and sources.

## Glossary

- Context Pack: Curated set of immediate, persistent, and external context supporting a run.
- Verification: Automated checks mapping to acceptance criteria.
- Provenance: Metadata linking outputs back to inputs and processes.

---

This PRD codifies the lifecycle defined in the plan and converts it into concrete functional requirements, interfaces, artifacts, and measurable outcomes.

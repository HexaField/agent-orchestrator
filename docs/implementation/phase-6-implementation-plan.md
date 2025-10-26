# Phase 6 Implementation Plan — Web UI, Diff Analysis & Session Resumability

Status: Draft

## Scope

Phase 6 delivers a lightweight web UI for reviewers and operators, a robust diff-analysis subsystem to detect scope creep or unrelated edits, and session persistence/resumability so interrupted runs can be restored and continued with full provenance.

In-scope:

- A minimal, server-backed web UI serving statically-rendered run reports and interactive review workflows.
- Diff analysis engine for scope creep detection (heuristics, metrics, configurable thresholds).
- Durable session checkpointing and resumability APIs that restore a run to an in-memory or on-disk state across process crashes or machine reboots.
- Integration points between the UI, Review Gate, and `progress.json` to present actionable diffs and allow reviewer actions from the browser.
- Unit and integration tests for the UI endpoints, diff analysis heuristics, and resume behavior.

## Objectives

- Provide a web UI that makes run artifacts, diffs, provenance, and review state easy to inspect and act upon.
- Build a diff-analysis module that computes measurable metrics (files changed, insertions/deletions, entropy, touched modules, unexpected paths) and flags edits that look out-of-scope.
- Implement session persistence (checkpoint snapshots and a resume API) so TaskLoop sessions can be paused and resumed with consistent provenance, locks, and conflict handling.
- Wire UI actions (approve/comment/request-changes) back into `progress.json` consistently and securely.

## Web UI — minimal design and contract

Purpose: provide a reviewer-friendly surface that exposes run summaries, per-task diffs, verification outputs, provenance links, and reviewer actions.

Architecture:

- A small Node/Express (or equivalent) HTTP server that serves:
  - Static assets (React/Preact/VanillaJS small app) for the interactive UI
  - REST API endpoints for run artifacts, `progress.json`, provenance, and reviewer actions
  - Optional authentication middleware (token-based) for protected access

Key pages/endpoints:

- `/runs` — list recent runs with status, runId, createdAt, phase, summary
- `/run/<id>` — run dashboard: summary, steps, verification overview, changelog link
- `/run/<id>/task/<taskId>` — task detail: unified diff, verification outputs, provenance, reviewer comments, approve/request-changes UI
- `/run/<id>/artifacts/*` — serves run artifacts (report.md, summary.json, provenance files)

API contract (selected):

- GET `/api/runs` → list of runs
- GET `/api/run/:id/progress` → `progress.json`
- POST `/api/run/:id/task/:taskId/review` { action: 'approve'|'request_changes'|'comment', notes?: string } → updates `progress.json` and writes an audit entry to `progress.log`

Security & access control:

- Add pluggable middleware to allow OAuth token, static API key, or local-CLI-signed tokens.
- Ensure reviewer actions are authenticated and included in the audit trail (by `by` and `at` fields in `progress.json`).

UI UX notes:

- Prioritize concise diffs with file-level grouping and expandable hunks.
- Surface diff-analysis flags prominently (e.g., "scope-alert: touched packages outside spec"), with links to the heuristic that raised it.

## Diff Analysis — detecting scope creep & unrelated edits

Purpose: provide automated signals when a run's edits span unexpected files, modules, or logical boundaries that indicate scope creep or potential agent overreach.

Core metrics and heuristics:

- Edit footprint: number of files changed, directories touched, and file-type distribution.
- Module boundary crossing: edits that modify files across multiple unrelated packages or services (detect via repo topology or configured monorepo mapping).
- High-entropy edits: large insertions/deletions or many small edits across many files.
- Unexpected path edits: modifications in a configured denylist (e.g., infra, CI, LICENSE) or outside the permitted workDir.
- Semantic similarity: compare changed file names and changed symbols against spec-scoped file list (approximate via token overlap or simple name matching) to estimate relevance.

Alert levels:

- INFO: minor, expected expansion (within allowed tolerances)
- WARNING: crosses a configured boundary (e.g., touches another package)
- BLOCK: edits in denylist paths, or changes that exceed configured thresholds for scope

Behavior and responses:

- Diff analysis runs after each atomic apply and writes a `diff-analysis/<seq>.json` artifact under `.agent/run/<id>/` with metrics, rule triggers, and suggested reviewer hints.
- The Review Gate surfaces these alerts and blocks commit if a BLOCK-level trigger occurs, requiring explicit reviewer approval to proceed.

Configuration & tuning:

- Default heuristics are conservative; repository owners may provide `.agent/diff-rules.json` to adjust thresholds, allowlists/denylist, and package boundaries.

## Session Persistence & Resumability

Purpose: allow runs to be paused, survive crashes, and be resumed with deterministic state and preserved provenance.

Checkpoint model:

- Checkpoints are saved under `.agent/run/<id>/checkpoints/<seq>.json` and include:
  - TaskLoop internal state (current prompt, last agent response, applied tasks list)
  - Open sessions (agent session ids), locks, and in-flight exec commands metadata
  - A digest of workspace snapshot (file sha map or patch list)

Storage & atomicity:

- Writing a checkpoint is a file-atomic operation: write to `tmp` then rename.
- Maintain a `latest` symlink or pointer file to the most recent checkpoint for fast resume.

Resume flow:

1. Orchestrator detects an incomplete run (presence of `checkpoints/latest`) and invokes `resumeRun(runId)`.
2. `resumeRun` validates checkpoint integrity (checks provenance artifacts exist, no partial writes) and restores TaskLoop state.
3. Verify agent session liveness; if agent session is stale, create a new agent session and rehydrate it with the last prompt and context.
4. Re-run verification for any tasks that were in `applied` but not `verified` (to detect drift) before continuing.

Conflict & safety handling:

- If workspace drift is detected (files changed outside of `.agent/run` since checkpoint), mark the run `conflicted` and surface via the UI. The reviewer must decide to continue, rebase, or abort.
- Provide `inspect-and-merge` helpers that show diffs between the checkpoint snapshot and current workspace state.

APIs and CLI:

- `orchestrator.resumeRun(runId)` — programmatic resume support for other tools and tests
- CLI: `npx agent-orchestrator resume --run <id>` to resume a run interactively

## Tests & QA guidance

- Unit tests for diff-analysis rules: verify metric computations and rule triggers on synthetic diffs.
- Integration tests for checkpoint write/read and resume flows, including crash-simulations (kill process after checkpoint write and validate resume recovers an equivalent TaskLoop state).
- UI tests (lightweight): ensure reviewer actions via REST endpoints update `progress.json` and write audit logs.

## Acceptance Criteria (Phase 6)

- Web UI exposes run list, run dashboard, and task detail pages, and reviewer actions persist to `progress.json`.
- Diff analysis generates metrics for each apply and raises at least INFO/WARNING/BLOCK alerts per configured heuristics; BLOCK-level alerts require explicit reviewer approval to commit.
- Checkpointing is reliable: resume from latest checkpoint restores run state and does not lose provenance; resume flow handles workspace drift via conflict detection.

## Next steps and small-risk extras

- Add a small embedded diff visualiser component (e.g., using a lightweight diff library) to the UI.
- Implement repository topology discovery to auto-generate package/service boundaries for better scope detection.

---

If you'd like, I can now implement the `diff-analysis` module and unit tests, or scaffold the UI server endpoints and a tiny static UI to review runs. Tell me which to start with.

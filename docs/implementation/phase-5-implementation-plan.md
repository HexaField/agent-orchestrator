# Phase 5 Implementation Plan — Progress Tracking, Review Gate & VCS Integration

Status: Draft

## Scope

Phase 5 delivers the human-in-the-loop review workflow and first-class VCS integration. It ties run progress to a `progress.json` tracker, implements a review gate that iterates through tasks, and provides safe, auditable git commit/branch/PR adapters. This phase closes the loop from verified artifacts to repository commits and human approval.

- `progress.json` step tracking (schema, writer, reader, sanity checks)
- Review Gate: task iteration, reviewer actions (approve/request-changes/comment), gating rules
- VCS Adapter (Git) with branch/commit/push and optional PR creation for GitHub/GitLab/Bitbucket/Radicle
- Changelog & PR description generation from provenance and `progress.json`
- CLI flags and policies to control auto-commit, dry-run, and approval modes
- Unit + integration tests for safe commits, branch naming, and review transitions

## Objectives

- Define and implement a deterministic `progress.json` format that records the run's tasks, status, provenance pointers, and reviewer decisions.
- Implement a Review Gate service that iterates `progress.json` tasks and enforces that no task marked as `applied` reaches `commit` before reviewer approval (except when `--auto-commit` is explicitly allowed and enabled by policy).
- Provide a robust `GitAdapter` that: creates branch, stages diffs, commits with structured commit messages, pushes to remote, and (optionally) opens a PR with attached run artifacts (report + provenance).
- Generate human-friendly changelogs and PR descriptions from the run's provenance and `progress.json` entries.
- Wire the CLI and orchestrator to include review and VCS steps as optional or mandatory depending on configured phase policies.

## Progress Tracking — `progress.json`

Purpose: provide a single-source-of-truth for run progress, tasks, and review state that can be read and updated by orchestrator components, reviewers, and verifier agents.

Location: `.agent/run/<id>/progress.json`

Minimal schema (recommended):

```json
{
  "runId": "string",
  "createdAt": "ISO-8601",
  "spec": "path/to/spec.md",
  "phase": "implement|create|new",
  "tasks": [
    {
      "id": "string",
      "title": "short description",
      "type": "diff|exec|llm-call|meta",
      "status": "pending|in-progress|applied|verified|blocked|skipped",
      "appliedAt": "ISO-8601|null",
      "provenancePath": "provenance/<seq>-<adapter>.json",
      "verification": {
        "checks": [{ "name": "lint", "status": "pass|fail|skipped", "outputPath": "..." }],
        "status": "pass|fail|partial"
      },
      "review": {
        "state": "unreviewed|approved|changes_requested|commented",
        "by": "user-id|null",
        "at": "ISO-8601|null",
        "notes": "string|null"
      }
    }
  ],
  "summary": { "success": true, "errors": [] }
}
```

Guidelines:

- Writers must perform file-atomic updates (write a temp file then rename) to avoid corruption.
- Each task update must append an audit entry to `.agent/run/<id>/progress.log` for immutable history.
- Tasks are the unit of work for the Review Gate and the Commit pipeline.
- The orchestrator should cap `progress.json` size or shard large runs into multiple files if > 10k tasks.

## Review Gate — human-in-the-loop workflow

Purpose: ensure humans retain final authority for any change that will be committed to the repository (unless explicitly allowed otherwise by operator policy).

Key behaviours:

- The Review Gate reads `progress.json` and exposes an ordered list of tasks that reached `applied` and `verified` states but are `unreviewed`.
- For each such task or logical task group, a Reviewer can perform: `approve`, `request_changes`, or `comment`.
- `approve` transitions a task's `review.state` to `approved` and records reviewer metadata. Approved tasks become eligible for commit.
- `request_changes` transitions to `changes_requested`, attaches reviewer notes, and returns the run to the TaskLoop with `blocked` or `in-progress` tasks. The TaskLoop must surface the reviewer notes to the agent in the next iteration.
- `comment` records reviewer feedback without blocking progression; comments are attached to the task and stored in provenance.

Iteration model:

1. Orchestrator writes tasks to `progress.json` as they are applied and verified.
2. A blocking call to the Review Gate (CLI or API) lists unreviewed tasks grouped by changelist.
3. The human reviewer walks the list, acting on each item. The review client writes back the reviewer decision into `progress.json` and `progress.log`.
4. When all tasks in the run are `approved`, a commit step is permitted (see VCS integration).

Safety features:

- `--dry-run` mode: the Review Gate can render the full set of to-be-committed diffs and reports without allowing approval actions.
- `--policy-skip-review` allowed only when operator policy and CLI flags explicitly permit it; this must be recorded in `progress.log` and the run summary.
- Timeouts: reviewers may 'timebox' a run. If review exceeds the configured TTL, the run becomes `stale` and requires re-verification.

Reviewer UX considerations (non-UI):

- The Review Gate provides concise artifacts for each task: unified diff, verification outputs (stdout/stderr), provenance pointer, and a short rationale extracted from the agent's step summary.
- Review decisions should be human-readable and machine-actionable: include a short code (`APPROVE`, `REQUEST_CHANGES`, `COMMENT`) and an optional structured remediation hint.

## VCS Integration — Git Adapter & Commit Workflow

Purpose: make it safe and reproducible to turn approved `progress.json` tasks into commits, branches, and PRs.

`GitAdapter` responsibilities:

- Create a new branch following a deterministic naming convention: `agent/<runId>/<short-title>` (sanitise filesystem and remote refs).
- Stage and commit diffs that correspond to tasks or logical groups. Commit messages must include:
  - short title (one line)
  - longer description generated from task rationales and provenance
  - a footer linking to `.agent/run/<id>/` (run id + provenance paths)
- Optionally sign commits if configured (GPG commit signing is supported via adapter config).
- Push branch to remote and return remote branch ref.
- Optionally open a Pull Request on supported providers with generated PR title, description, labels, reviewers, and attached artifacts (report.md and summary.json).

Adapter contract sketch (TypeScript-like):

```ts
interface GitAdapterConfig {
  repoPath: string
  remote?: string
  author?: { name: string; email: string }
  signCommits?: boolean
}

interface GitAdapter {
  createBranch(branchName: string, base?: string): Promise<void>
  commit(changes: Array<{ path: string; content: string }>, message: string): Promise<{ commitSha: string }>
  push(branchName: string): Promise<{ remoteRef: string }>
  createPR(opts: {
    title: string
    body: string
    headRef: string
    baseRef?: string
    reviewers?: string[]
    labels?: string[]
  }): Promise<{ url: string; id: string }>
}
```

Commit grouping strategy:

- Group tasks into either per-task commits or a single commit per logical change. The default is "per-progress-chunk" (i.e., group contiguous applied tasks into one commit) to keep history readable.
- Each commit message must reference its tasks by id and include a one-line summary and an expanded rationale section derived from provenance entries.

Changelog & PR description generation:

- Use `progress.json` + `.agent/run/<id>/provenance/*.json` to render:
  - a top-level summary of what changed and why
  - per-file diffs (or links to diffs in the run folder)
  - verification summary and which checks passed/failed
  - reviewer notes and approval metadata

Provider-specific notes:

- GitHub/GitLab: create PR via provider API, attach `report.md` and `summary.json`, and add reviewers/labels if configured.
- Bitbucket: create a pull request with similar artifacts; adapt to provider API differences.
- Radicle: create a signed commit and publish the change; PR automation varies by target.

Safety & rollback:

- The adapter must support `dryRunCommit()` which simulates staging and commit message generation without touching repo state.
- If `push` or `createPR` fails mid-flow, the adapter should leave the local workspace in a consistent state and write a failure artifact into `.agent/run/<id>/vcs-errors.json` with full logs for diagnostics.

## CLI & Orchestrator wiring

New CLI flags (Phase 5):

- `--commit` : after approvals, create commits and push to remote
- `--open-pr` : after push, open a PR on the configured provider
- `--auto-commit` : skip review gate and commit automatically (policy gated)
- `--vcs-remote <name>` : remote name to push to (default: `origin`)
- `--vcs-base <branch>` : base branch for new branch/PR (default: `master` or configured default)

Orchestrator behavior:

1. After TaskLoop finishes a run, produce `.agent/run/<id>/progress.json` and `report.md`.
2. If `--dry-run` is set, stop and render artifacts for review.
3. If `--commit` is set, call the Review Gate. If the gate yields all tasks `approved` (or `--auto-commit` is used and allowed), call `GitAdapter` to create branch, commit, and push.
4. If `--open-pr` is set, create a PR and save the returned PR URL in `.agent/run/<id>/pr.json`.

Auditing and provenance:

- Every VCS action is recorded as a provenance event with: adapter call args, stdout/stderr, commit SHA, remote refs, PR URL, and timestamp. Store under `.agent/run/<id>/provenance/vcs-<seq>.json`.

## Tests & E2E guidance

- Unit tests:
  - `progress.json` writer/reader: concurrent writers, corruption resistance, and schema validation.
  - Review Gate logic: state transitions (`unreviewed` → `approved` / `changes_requested`), TTL expiry, policy gating.
  - `GitAdapter` (mocked): commit message generation, branch naming sanitization, dry-run behaviours.

- Integration tests (gated behind an env var):
  - Create a temporary repo, run a local TaskLoop that writes a couple of tasks and diffs, run the Review Gate approving tasks, call `GitAdapter.commit()` and assert branch/commit created and pushed to a local bare repo.
  - PR creation tests against a test instance or provider mock API.

- E2E test (manual/gated): full flow from run → review → commit → PR (assert `.agent/run/<id>/pr.json` exists and contains provider URL).

## Acceptance Criteria (Phase 5)

- `progress.json` exists for every run and follows the schema; updates are atomic and logged to `progress.log`.
- The Review Gate enforces human approval for committed changes by default. `--auto-commit` must be policy-gated and produce an immutable audit trail when used.
- `GitAdapter` can create a branch, commit grouped tasks with structured messages, push the branch, and (optionally) open a PR with attached artifacts; results are recorded in provenance.
- CLI flags `--commit` and `--open-pr` function end-to-end in integration tests (gated) and produce `.agent/run/<id>/pr.json` on success.
- All VCS actions can be simulated with `dryRunCommit()` and do not change repo state in dry-run mode.

## Next steps and small-risk extras

- Add a `review-client` CLI that lists unreviewed tasks and allows quick approve/request-changes via terminal UI.
- Add per-repository policy config (`.agent/policy.json`) to control branch naming, required reviewers, and `auto-commit` allowlist.
- Wire provider webhooks (PR events) to automatically update `progress.json` when reviewers act on the PR in the provider UI.

## Notes and assumptions

- This phase assumes the repo is a Git repository. Non-git backends are supported only via adapter extensions.
- Secrets for provider APIs (GitHub/GitLab tokens) are provided to the adapter via configuration; adapters must not write secrets to run artifacts.
- The default branch fallback is `master` if not configured.

---

If you'd like, I can now:

- Implement the `progress.json` schema, reader/writer utilities, and unit tests.
- Add a `src/adapters/vcs/gitAdapter.ts` skeleton and tests for branch/commit/dry-run behaviors.
- Create a simple CLI `review-client` that reads `.agent/run/<id>/progress.json` and allows approve/request-changes from the terminal.

Tell me which to implement first and I'll add a focused todo and begin edits.

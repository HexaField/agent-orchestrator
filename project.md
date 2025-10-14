# System Flow Overview

This document explains the overall system architecture and runtime flow represented by the project. It describes the components, their responsibilities, the data artifacts they exchange, and the step-by-step flow of control and decisions. The goal is to provide a clear, LLM-friendly overview of how the system orchestrates automated agent runs, human review, progress tracking, and iterative task generation.

## Summary

This project is an automated workflow for implementing specification-driven tasks using an agent (LLM or automated runner), with human review points and a feedback loop to schedule next tasks. The system alternates between automated runs and human checkpoints: it generates prompts, runs an agent to produce changes, evaluates results, updates a persistent `progress.md`, and either closes the task with changelogs and a PR or generates recommendations and re-runs. Auxiliary prompt-generators produce context, checklists, and templates that guide each stage.

Key goals:
- Automate task execution from a specification while maintaining human oversight.
- Keep a single canonical progress artifact (`progress.md`) updated as the source of truth.
- Produce audit artifacts (changelogs, commits/PRs) when requirements are met.
- Provide structured prompts and templates to control agent behavior and capture decisions.

## Components and artifacts

- spec (`spec.md`): The source specification describing the desired outcome or task.
- progress (`progress.md`): The canonical progress tracker containing current work, clarifications, status, and human decisions.
- Agent runner (`Start Agent` / `Agent Finishes Run`): Executes tasks driven by prompts and returns artifacts or outputs.
- Human approval (`Human Approved?`): A decision checkpoint where a human either authorizes the agent run or requests clarification/changes.
- Generators: Prompt/template-producing components that create prompts used by the agent or by update/review steps. These include:
  - `Generate Checklist` (genChecklist)
  - `Generate Context Prompt` (genContext)
  - `Generate Response Type` (genResponseType)
  - `Generate Review of Changes` (genReviewChanges)
  - `Generate Clarification Prompt` (genClarify)
  - `Generate Change Prompt` (genChange)
  - `Generate Update Progress Prompt` (genUpdate)
  - `Generate Next Task Prompt` (genNext)
- Clarification (clarif): A short-lived interactive step to resolve ambiguity before running the agent or proceeding.
- What has been done? (whatDone): An evaluation step that categorizes run results (spec implemented / completed task / needs clarification).
- Update Progress (updateProgress): Writes results back to `progress.md` and can produce the `Next Task`.
- Next Task (nextTask): The next item scheduled for an agent run.
- Recommend Changes (recommend): A synthesized set of recommendations when requirements are not met.
- Changelog (changelog): A generated audit file `changelogs/<taskname>-<timestamp>.md` summarizing changes when requirements are met.
- Commit & Create PR (commit): Finalize results by committing and opening a PR.

## Flow (step-by-step)

1. Seed and review:
   - The process starts with a specification in `spec.md` and a progress document `progress.md` that may already contain context and prior work.
   - Generators (e.g., `genChecklist`, `genContext`) may augment `progress.md` with checklists and contextual prompts.

2. Human approval checkpoint:
   - `progress.md` is presented to a human reviewer (`Human Approved?`).
   - If the human approves (`Yes`), the system constructs an `Initial Agent Prompt` (`iap`) and proceeds to start the agent.
   - If the human requests clarification (`No - Clarify`), the workflow returns to updating `progress.md` with clarifications and repeat this checkpoint after clarifications are applied.

3. Agent run:
   - The agent is started using the `Initial Agent Prompt` and any supplemental context (e.g., `genContext` supplies contextual prompts; this link is auxiliary/dotted).
   - The agent runs and reaches `Agent Finishes Run` with outputs, patches, or artifacts.

4. Evaluate results (`What has been done?`):
   - The system evaluates the run to determine whether the spec was implemented, the task is completed, or additional clarification is needed.
   - If `Spec implemented`: move to code review.
   - If `Completed Task` (a successful run that should be recorded): run the `Update Progress` step.
   - If `Needs Clarification`: perform a clarification step and loop back to re-run the agent after clarifying.

5. Code review and requirements check:
   - If the run claimed to implement the spec, `Review Code` is performed.
   - After review, the system asks `Are all requirements met?` (`reqs`).
   - If `Yes`: the system generates a `changelog` entry (via `genReviewChanges`) and proceeds to commit & create a PR.
   - If `No`: the system generates a `genChange` prompt to produce `Recommend Changes`, which are fed back into another agent run.

6. Update progress and schedule next work:
   - When a task is completed or after changes are accepted, `Update Progress` writes the outcome to `progress.md` and may schedule a `Next Task` (via `genNext`).
   - The `Next Task` becomes the input to the next agent run, closing the loop.

7. Finalization & audit:
   - When requirements are satisfied, the system produces a changelog file for audit and commits the changes, creating a pull request for integration, or notification for the user.

## Decision points and branching

- Human approval (`Human Approved?`): binary decision—Yes => run agent; No => clarify and update `progress.md`.
- What has been done? (`whatDone`): multi-way decision with at least three outcomes—Spec implemented / Completed Task / Needs Clarification.
- Requirements met (`reqs`): binary decision—Yes => changelog & commit; No => generate changes and re-run.

## Dataflow and control flow relationships (concise)

- `spec` updates feed into `progress` and can directly trigger clarifications.
- Generator components augment prompts and guiding artifacts (checklist, context, response type) and feed into agent runs, reviews, and updates.
- The agent run (`start` -> `agentDone`) produces outputs that are evaluated by `whatDone`.
- `whatDone` routes to `review`, `updateProgress`, or `clarif` depending on result.
- `updateProgress` updates the canonical `progress.md` and produces `nextTask`.
- `nextTask` triggers the next agent run; the loop continues until requirements are met and a `changelog` + `commit` are produced.

## Operational considerations and edge cases

- Ambiguous or incomplete specs: must route to `clarif` before any agent run; generators should surface likely ambiguities (via `genClarify`).
- Repeated failures: the system should detect loops of repeated `reqs -- No` and either escalate to a human or delay with a backoff and clearer instructions.
- Partial implementations: `whatDone` must distinguish between partial and complete spec coverage; acceptance criteria for `Spec implemented` should be explicit in `progress.md`.
- Concurrent modifications: `progress.md` is the source of truth—concurrent agent runs or manual edits should be serialized, locked, or reconciled.

## Implementation guidance for LLM-driven automation

- Use `progress.md` as the single canonical artifact for human review and to seed prompts.
- Keep generator components small, focused, and templated so they are easy to test and iterate (e.g., `genClarify` template should include missing fields and example answers).
- Preserve labeled decision links (e.g., "Yes", "No - Clarify", "Spec implemented") in prompts so the LLM knows which flow branch to follow.
- Log all agent outputs and decisions to a changelog/audit trail to support traceability.

## Exact relationships (for reproducibility)

These are the directed edges from the original diagram, included here for reproducibility and to feed structured agents or LLM prompts. Preserve labels exactly where present.

spec --> progress
spec --> clarif
genChecklist --> progress
genContext -.-> iap
progress --> ha
ha -- "Yes" --> iap
iap --> start
ha -- "No - Clarify" --> progress
genClarify --> clarif
start --> agentDone
agentDone --> whatDone
whatDone -- "Spec implemented" --> review
whatDone -- "Completed Task" --> updateProgress
genUpdate --> updateProgress
updateProgress --> progress
updateProgress --> nextTask
genNext --> nextTask
nextTask --> start
whatDone -- "Needs Clarification" --> clarif
clarif --> start
review --> reqs
genResponseType --> agentDone
genReviewChanges --> changelog
reqs -- "Yes" --> changelog
reqs -- "No" --> genChange
genChange --> recommend
recommend --> start
changelog --> commit

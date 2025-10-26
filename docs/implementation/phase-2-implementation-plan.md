# Phase 2 Implementation Plan — Verification & Execution

Status: Draft

## Scope

Phase 2 implements the execution and verification layer that safely runs commands and persists filesystem actions: the VerificationEngine and the low-level Exec and FS adapters. These components enable the orchestrator and task loop to verify changes (build, lint, test) and collect structured results.

## Objectives

- Implement a `VerificationEngine` capable of running shell commands and returning structured check results.
- Implement `ExecAdapter` (NodeProcess) to run CLI commands with timeout, env, and working-directory support.
- Implement `FSAdapter` (NodeFs) providing read/write/diff primitives and a deterministic diffing API for run artifacts.
- Ensure verification outputs (exit codes, stdout/stderr, durations) are recorded in provenance logs.

## Contracts and Behavior

- ExecAdapter
  - Inputs: { cmd: string, cwd?: string, env?: Record<string,string>, timeoutMs?: number }
  - Output: { code: number, stdout: string, stderr: string, durationMs: number }
  - Errors: handle non-zero exits and timeouts cleanly; expose error metadata to caller.

- FSAdapter
  - Inputs: read(path), write(path, content), diff(basePath, glob?)
  - Output: string | void | { files: DiffEntry[] }
  - Errors: permission, path not found

- VerificationEngine
  - Inputs: array of commands, acceptance criteria mapping
  - Output: { checks: { name, status, output, durationMs }[] }

## Deliverables (Phase 2)

- `nodeProcess.ts` ExecAdapter implementation + tests.
- `nodeFs.ts` FSAdapter implementation + tests (diff support).
- `verification/engine` implementation + tests that run simple commands in temp directories.
- Integration tests showing verification results are recorded in provenance.

## Observability & Logging

- All verification runs must be logged to the run JSONL event log with timestamps, inputs, outputs, and durations.
- Verification failures must include full stdout/stderr in the provenance artifacts for later inspection.

## E2E & Safety

- Verification tests that run real build/test commands should be gated by environment variables to avoid running on CI without intent.
- Commands executed by VerificationEngine may run inside sandboxed temp directories during tests to avoid side effects.

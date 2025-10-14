export type OrchestratorStatus =
  | 'idle'
  | 'awaiting_approval'
  | 'running'
  | 'needs_clarification'
  | 'awaiting_review'
  | 'changes_requested'
  | 'ready_to_commit';

export type WhatDone =
  | 'spec_implemented'
  | 'completed_task'
  | 'needs_clarification'
  | 'failed';

export interface NextTask {
  id: string;
  title: string;
  summary: string;
  acceptanceCriteria: string[];
  createdAt: string; // ISO8601
}

export interface StateJsonV1 {
  version: 1;
  currentRunId: string | null;
  status: OrchestratorStatus;
  lastOutcome: 'none' | WhatDone;
  nextTask: NextTask | null;
}

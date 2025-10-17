export interface LLMAdapter {
  name: string
  generate(input: {
    system?: string
    prompt: string
    temperature?: number
    maxTokens?: number
    stop?: string[]
  }): Promise<{ text: string; raw?: unknown }>
}

export interface AgentAdapter {
  name: string // "codex-cli" | "copilot-cli" | "custom"
  run(input: {
    prompt: string
    cwd: string
    env?: Record<string, string>
    timeoutMs?: number
  }): Promise<{ stdout: string; stderr: string; exitCode: number }>
}

export interface SessionHandle {
  id: string
  pid?: number
  meta?: Record<string, unknown>
}

export type SessionEvent =
  | { type: 'stdout'; text: string }
  | { type: 'ndjson'; json: any }
  | { type: 'clarify'; question: string }
  | { type: 'artifact'; path?: string; content?: string }
  | { type: 'finish'; exitCode?: number }
  | { type: 'error'; message: string }

export interface SessionAgentAdapter extends AgentAdapter {
  /** Start a long-lived interactive session. */
  startSession?(input: { cwd: string; env?: Record<string, string>; runId?: string }): Promise<SessionHandle>
  /** Send a message into the session; returns an async iterable of SessionEvent. */
  send?(session: SessionHandle, message: string): AsyncIterable<SessionEvent>
  /** Close the session and release resources. */
  closeSession?(session: SessionHandle): Promise<void>
}

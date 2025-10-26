/**
 * Agent adapter interfaces
 *
 * These interfaces describe the minimal contract an Agent adapter must
 * implement for the Phase 1 TaskLoop orchestrator.
 *
 * Implementations must avoid reading configuration from environment
 * variables and should accept configuration via method parameters.
 */

/**
 * Options used to start an agent session.
 */
export interface AgentStartOptions {
  /** Human-friendly title for the session (optional) */
  title?: string
  /** Optional runtime limits (tokens, timeouts, etc.) */
  limits?: {
    maxIterations?: number
    timeoutMs?: number
    [key: string]: any
  }
}

/**
 * Result shape returned by `AgentAdapter.run`.
 */
export interface AgentRunResult {
  /** Raw text returned by the agent */
  text: string
  /** Optional structured tasks parsed from the agent output */
  tasks?: Array<Record<string, any>>
  /** Optional metadata about the call (tokens used, provider info) */
  meta?: {
    tokensUsed?: number
    provider?: string
    [key: string]: any
  }
}

/**
 * Minimal AgentAdapter contract used by the TaskLoop.
 *
 * Implementations should perform any filesystem and exec actions when
 * directed by the orchestrator; they should also expose a simple session
 * lifecycle API.
 */
export interface AgentAdapter {
  /**
   * Start a new agent session in the provided project path.
   * Returns a provider-specific session id.
   */
  startSession(options: AgentStartOptions): Promise<string>

  /**
   * Run the agent with free-text input using the provided session id.
   * Returns the raw text and optional structured tasks.
   */
  run(sessionId: string, input: string): Promise<AgentRunResult>

  /**
   * Stop the running adapter and clean up any child processes.
   */
  stop(): Promise<void>
}

/**
 * Example (commented):
 *
 * const adapter = await createOpenCodeAgentAdapter(3780, '/path/to/proj')
 * const session = await adapter.startSession({ projectPath: '/path/to/proj' })
 * const r = await adapter.run(session, 'Make a file named hello.txt with contents `hi`')
 */

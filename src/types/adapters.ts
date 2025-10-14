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

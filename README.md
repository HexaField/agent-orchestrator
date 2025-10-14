# Agent Orchestrator

A spec-driven orchestration CLI that coordinates LLMs and external agents to implement and verify changes against a project spec. It records a reproducible audit trail under `.agent/` and enforces verification and review gates before changes are accepted.

Key goals
- Run repeatable agent-driven iterations: generate a change, apply it as a patch, run verification, and update `progress.md`.
- Keep detailed run artifacts and preserved rejections for auditability.
- Provide safe defaults (dry-run and test hooks) so you can evaluate behavior before enabling real command execution.

Install

Install globally to use the `agent-orchestrator` CLI, or use `npx` for ephemeral runs:

```bash
# Global
npm install -g agent-orchestrator

# Or using npx (preferred for ad-hoc runs)
npx agent-orchestrator <command> --cwd .
```

Quickstart (Codex agent + local vllm example)

1) Initialize a repository for the orchestrator

```bash
npx agent-orchestrator init --cwd .
```

2) Configure the Codex-based agent (OpenAI Codex CLI) and a local `vllm` LLM provider

Prerequisites:
- Install and configure a local `vllm` server or adapter according to the `vllm` adapter docs.
- Ensure you have OpenAI credentials that allow access to Codex (if using remote Codex) or the `codex-cli` adapter configured to target your Codex-compatible service.

Example environment variables (local vllm + Codex CLI):

```bash
# If using the local vllm adapter the CLI expects AO_LLM_PROVIDER=vllm and
# VLLM_SERVER_URL to point at your local vllm endpoint (example: http://localhost:8080)
export AO_LLM_PROVIDER="vllm"
export VLLM_SERVER_URL="http://localhost:8080"

# For the Codex agent (codex-cli adapter) configure the OpenAI API key or
# other Codex-compatible credentials used by the adapter
export OPENAI_API_KEY="sk_..."
```

3) Run the orchestrator (preview or execute)

Preview (safe): shows what would happen without executing shell commands. Use the `codex-cli` agent and the `vllm` LLM provider:

```bash
npx agent-orchestrator run --cwd . --agent codex-cli --llm vllm --prompt "Implement the user login feature"
```

Execute (real changes): enable command execution only when you trust the environment and adapters.

```bash
AO_ALLOW_COMMANDS=1 npx agent-orchestrator run --cwd . --agent codex-cli --llm vllm --prompt "Implement the user login feature"
```

4) Check the orchestrator status and inspect run artifacts

```bash
npx agent-orchestrator status --cwd .
npx agent-orchestrator show-run <runId> --cwd .   # show run metadata
npx agent-orchestrator list-rejections <runId> --cwd .  # list preserved .rej files (if any)
```

Commands
- `init` — bootstrap `.agent/`, create `progress.md`, initialize state
- `run` — execute one orchestrated iteration (LLM → Agent → verify → patch apply)
- `status` — print current status
- `review` — record review actions (`--approve` / `--request-changes`)
- `commit` — create a changelog, commit, and optionally open a PR (requires credentials)

Adapters and configuration
- LLM adapters: `vllm`, `openai-compatible`, `openai`, `passthrough`
- Agent adapters: `http`, `copilot-cli`, `codex-cli`, `custom`

Set `AO_LLM_PROVIDER`, `AGENT`, or use CLI flags `--llm` and `--agent` to select adapters. For the HTTP agent set `AGENT_HTTP_ENDPOINT` to your agent server URL.

Safety & test hooks
- `AO_ALLOW_COMMANDS` — must be set to `1` for the orchestrator to execute shell commands produced by agents (disabled by default).
- `AO_DRY_RUN` — simulate command execution (no side-effects).
- `MOCK_RUN_COMMAND` — internal test hook (JSON) used by tests to simulate `runCommand` responses.

More details
For a deep dive into architecture, adapters, marker formats, `.rej` handling, and operational guidance, see `architecture.md`.

License

MIT

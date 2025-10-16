# Agent Orchestrator

A spec-driven orchestration CLI that coordinates LLMs and external agents to implement and verify changes against a project spec. It records a reproducible audit trail under `.agent/` and enforces verification and review gates before changes are accepted.

Key goals

-- Run repeatable agent-driven iterations: generate a change, apply it as a patch, run verification, and update `progress.json`.

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

1. Initialize a repository for the orchestrator

```bash
npx agent-orchestrator init --cwd .
```

2. Configure the Codex-based agent (Codex CLI) and a local `vllm` or `ollama` LLM provider

Prerequisites:

- Install and configure a local `vllm` server or adapter according to the `vllm` adapter docs.
- If using the `codex-cli` adapter that proxies to a Codex-compatible service, configure its endpoint appropriately. This project no longer relies on cloud OpenAI APIs and only supports local LLM providers.

Configuration

Prefer per-project configuration stored in `.agent/config.json` which is seeded by `npx agent-orchestrator init --cwd .`. You can also set values via CLI flags (`--llm`, `--agent`, etc.) when invoking commands. Example project config keys:

- `LLM_PROVIDER` — one of `vllm`, `passthrough`, `ollama` (default: `ollama`)
- `LLM_ENDPOINT` — optional HTTP base URL for local LLMs (e.g. `http://localhost:11434/v1`)
- `AGENT` — which agent adapter to use (e.g. `codex-cli`, `http`, `custom`)

To seed a project config and templates:

```bash
npx agent-orchestrator init --cwd .
```

3. Run the orchestrator (preview or execute)

Preview (safe): shows what would happen without executing shell commands. Use the `codex-cli` agent and the `vllm` LLM provider:

```bash
npx agent-orchestrator run --cwd . --agent codex-cli --llm vllm --prompt "Implement the user login feature"
```

Execute (real changes): the orchestrator will execute shell commands produced by agents. Tests and environments should ensure the workspace is writable and the agent adapter is trustworthy before running.

4. Check the orchestrator status and inspect run artifacts

```bash
npx agent-orchestrator status --cwd .
npx agent-orchestrator show-run <runId> --cwd .   # show run metadata
npx agent-orchestrator list-rejections <runId> --cwd .  # list preserved .rej files (if any)
```

Commands

- `init` — bootstrap `.agent/`, create `progress.json`, initialize state
- `run` — execute one orchestrated iteration (LLM → Agent → verify → patch apply)
- `status` — print current status
- `review` — record review actions (`--approve` / `--request-changes`)
- `commit` — create a changelog, commit, and optionally open a PR (requires credentials)

Templates

- Core prompt templates live in the repository under `.agent/templates/` and are editable by the user.
- Templates support simple `%var%` interpolation (for example `%spec%` and `%reason%`).
- Running `npx agent-orchestrator init --cwd .` will seed the `.agent/templates/` folder with default templates; editing those files customizes the agent prompts.

Adapters and configuration -- LLM adapters: `vllm`, `passthrough`, `ollama`

- Agent adapters: `http`, `copilot-cli`, `codex-cli`, `custom`

-Set `LLM_PROVIDER`, `AGENT`, or use CLI flags `--llm` and `--agent` to select adapters. For the HTTP agent set `AGENT_HTTP_ENDPOINT` to your agent server URL.

Safety & test hooks

- `DRY_RUN` — simulate command execution (no side-effects). Use replay fixtures for deterministic testing of agent outputs.

More details For a deep dive into architecture, adapters, marker formats, `.rej` handling, and operational guidance, see `architecture.md`.

License

MIT

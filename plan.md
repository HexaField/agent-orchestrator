## 1. **Initialization — Establishing the Working Universe**

**Purpose:** Define the environment, boundaries, and mission.

At this stage, the system builds a foundation of understanding:

- **Project Scope:** Reads `spec.md`, `progress.json`, or any initiating specification file.
- **Environment Setup:** Creates the `.agent/` directory, indexes the repo, and connects to your local LLM and KMS sources.
- **Identity & Role Context:** Determines which roles (e.g., backend implementer, verifier) are relevant for this run.
- **Persistent Memory:** Loads summaries from previous runs, long-term lessons, and any relevant standards.

The outcome is a **baseline context state**: what this agent knows, what it’s allowed to change, and what success means.

Design note: Core tools (LLMs, KMS, VCS, repo indexers) are accessed through neutral, interchangeable interfaces, while run strategy and policies live in the orchestrator above them.

---

## 2. **Phase Definition — Choosing the Mode of Work**

The orchestrator chooses or is told which **phase** it’s in:

- **New-Spec** → exploratory and requirements gathering
- **Create-Spec** → design, architecture, and planning
- **Implement-Spec** → coding, verifying, committing

Each phase changes:

- The _goal_ of the session (research vs. execution)
- Which **tools** are enabled (e.g., read-only vs. write access)
- The **style** of prompts sent to the agent and LLM
- The **external sources** considered (RFCs, code standards, etc.)

Phase policies compose behavior on top of those neutral interfaces without binding to any specific implementation. This segmentation keeps the system focused and prevents “context sprawl.” It’s how you bound cognitive load and risk.

---

## 3. **Context Assembly — Building the Cognitive Frame**

Before any action, the system constructs the **context pack** — the total information the LLM and agent need for this turn.

It draws from three layers:

### a) Immediate Context

- Current phase, task, checklist, user clarifications
- Previous session summary (condensed)
- Local code or file snippets relevant to the current spec section

### b) Persistent Context

- The project’s long-term memory (changelogs, previous implementations)
- Standards, architecture guidelines, decisions
- Known risks, TODOs, or “open questions” from earlier sessions

### c) External Context

- Retrieved material from the Knowledge Management System (KMS)
  - Standards documents
  - Past incidents
  - Product definitions
  - Company-wide coding norms

Context retrieval relies on stable adapters, while selection and shaping are orchestrator responsibilities. The system **ranks, filters, and merges** these layers into a coherent narrative — essentially “briefing” the LLM on exactly what matters _now._

---

## 4. **Prompt Compilation — Translating Context into Intent**

Once relevant context is gathered, it’s **structured** into a prompt with clear, repeatable sections:

- **System message:** Defines the role, tools, and constraints (“You are the backend implementer… you may read/write only in packages/api”)
- **User message:** Contains the full context pack (summaries, relevant code, checklist items, external references)
- **Optional assistant few-shot examples:** Show ideal output format or style
- **Output schema:** Tells the model how to respond (e.g., “Output a patch, then a test plan, then a summary”)

Prompt construction remains policy-driven, using stable tool interfaces. This standard structure ensures every agent call is predictable, auditable, and debuggable — unlike ad-hoc prompts.

---

## 5. **Agent Session — Persistent Action Loop**

Now the **OpenCode agent** (or your future unified runtime) takes over.

A session is a _bounded yet continuous process_: the agent can reason, run commands, make edits, and ask clarifications — all within a controlled sandbox.

### Inside this loop:

1. The agent receives the prompt.
2. It reasons using the LLM and its own internal tools (read/write files, run tests, inspect output).
3. It performs atomic actions (e.g., modify a file, execute a test, apply a patch).
4. It logs every action into the session record (commands run, diffs applied, test outputs).

The orchestrator monitors this loop — capturing artifacts, diffs, logs, and the agent’s natural-language reasoning.

Execution uses interchangeable adapters; the orchestrator sequences actions and guardrails.

Session persistence ensures that if the agent stops or crashes, it can be resumed with full situational awareness.

---

## 6. **Verification — Objective Grounding**

After each agent cycle, the orchestrator runs a **verification phase** to confirm that results match expectations.

This is the “scientific method” layer of your system.

### Verification may include:

- **Automated checks:** lint, typecheck, tests, static analysis
- **Checklist matching:** every acceptance criterion linked to a verification function
- **Diff analysis:** detect unexpected scope creep or unrelated edits
- **Review triggers:** if results look ambiguous, flag for human or verifier-agent review

Verification tools are pluggable; mapping from acceptance criteria is owned by orchestration. Verification is non-negotiable — it’s how the system earns its guarantee that work satisfies the spec.

---

## 7. **Review and Approval — Human-in-the-Loop Checkpoint**

After verification passes, results move to the **review gate.**

Here, the human (or a verifier agent) examines:

- Generated diffs
- Verification results
- The rationale written by the agent
- Links to supporting context and decisions

If approved, the system marks the task as “ready-to-commit.” If not, it records feedback or change requests — which then seed the next iteration of the loop.

This maintains transparency and human control at critical decision boundaries.

---

## 8. **Commit and Integration — Merging the Work**

When everything passes review:

1. The orchestrator generates a **changelog** summarizing what changed and why.
2. It creates a **git branch/commit** tied to the `.agent/run` metadata.
3. Optionally, it opens a **pull request** with the verification report and changelog attached.

Source control actions are invoked through adapters, while timing and content are orchestration concerns. This makes each agent’s output indistinguishable from a well-documented, human-authored contribution — complete with context, evidence, and lineage.

---

## 9. **Session Summarization — Compressing the Experience**

After a run completes, the system distills the session into a **concise narrative summary:**

- Decisions made
- Rationales and tradeoffs
- Constraints discovered
- Outstanding questions

This becomes the next session’s starting context, stored in `.agent/memory/`.

Instead of replaying every token of conversation, you maintain an evolving _knowledge digest_ — the agent’s own diary.

---

## 10. **Knowledge Integration — Learning Beyond the Project**

This is where the orchestrator connects to the **external knowledge ecosystem**.

It feeds back its new findings — lessons, clarified requirements, resolved edge cases — into a shared **Knowledge Management System** (KMS), e.g.:

- Updating runbooks or architecture standards
- Publishing a mini “postmortem” of the run
- Tagging snippets of reusable reasoning or code

In return, future runs can _retrieve_ that knowledge automatically as relevant context.

The loop is now self-reinforcing: every agent run expands the organization’s intelligence footprint.

---

## 11. **Continuous Evolution — Context as an Ecosystem**

Over time, three feedback loops form:

1. **Within-session learning:** The agent refines its understanding as it iterates.
2. **Cross-run learning:** Each completed run contributes to a growing body of persistent context.
3. **Cross-system learning:** The orchestrator exchanges distilled insights with the global KMS.

The goal isn’t infinite memory — it’s _structured forgetting_: retaining only what’s reusable and trimming noise. Context becomes an ecosystem of living documents, evolving with every cycle.

---

## 12. **Governance, Safety, and Explainability**

Throughout all stages:

- Every input, action, and output is **logged and attributed**.
- **Provenance metadata** ties every statement or file change back to its source prompt and verification result.
- Human reviewers can **trace decisions** across time: _why was this change made, and based on what evidence?_
- The system remains **auditable, restartable, and compliant.**

This gives you the “spec to verified implementation” guarantee — the holy grail of automated engineering.

---

### **In Summary**

| Stage         | Purpose                             | Context Focus                     |
| ------------- | ----------------------------------- | --------------------------------- |
| **Init**      | Define mission and load environment | Persistent                        |
| **Phase**     | Choose working mode                 | Immediate                         |
| **Assemble**  | Gather relevant context             | Immediate + Persistent + External |
| **Prompt**    | Translate into structured intent    | All                               |
| **Session**   | Execute with persistence            | Immediate                         |
| **Verify**    | Ground outputs in objective truth   | Immediate                         |
| **Review**    | Human oversight                     | Persistent                        |
| **Commit**    | Integrate and publish               | Persistent                        |
| **Summarize** | Compress learnings                  | Persistent                        |
| **Integrate** | Feed knowledge back                 | External                          |
| **Evolve**    | Continuous self-improvement         | All                               |

---

**In essence:** Your orchestrator becomes a _living, context-aware engineering organism_ — one that remembers, reasons, acts, verifies, learns, and teaches back. It composes neutral tool adapters through policy-driven flows. It doesn’t just run commands; it participates intelligently in the software development lifecycle.

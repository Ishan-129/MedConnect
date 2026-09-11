# Rule 05: Skills Usage & Multi-Agent Subagent Orchestration

## 🎯 Purpose
To ensure every AI Agent (Antigravity, Claude Code, Cursor, Windsurf, Copilot, Codex) leverages specialized skills and orchestrates parallel subagents efficiently without state corruption or hallucinations.

---

## 🧰 1. Mandatory Skill Invocation

Before writing code or architecting solutions, AI Agents **MUST** load and read the corresponding `SKILL.md` located in `.agents/skills/` or `.agents/plugins/`:

| Task Type | Required Skill(s) to Consult |
| :--- | :--- |
| **New Feature / Refactor Planning** | `writing-plans`, `brainstorming`, `executing-plans` |
| **Parallel / Subagent Tasks** | `dispatching-parallel-agents`, `subagent-driven-development`, `team-agent-orchestration` |
| **Bug Diagnosis & Fixing** | `systematic-debugging`, `orch-fix-defect` |
| **Testing & TDD** | `test-driven-development`, `tdd-workflow`, `verification-before-completion` |
| **Frontend & UI / Animations** | `react-patterns`, `frontend-patterns`, `motion-ui`, `frontend-a11y`, `vite-patterns` |
| **Backend, SQL & Migrations** | `postgres-patterns`, `backend-patterns`, `api-design` |
| **Healthcare Safety & Compliance** | `healthcare-phi-compliance`, `healthcare-emr-patterns` |

---

## 🤖 2. Multi-Agent & Subagent Execution Protocol

When tackling complex, multi-step tasks:

1. **Decompose into Independent Units**:
   - Break tasks into self-contained sub-tasks that do not touch overlapping files simultaneously.
   - Example: Dev 2 agent runs concurrency test while Dev 3 agent polishes queue animation UI.

2. **Subagent Context & Task Brief**:
   - Every dispatched subagent must receive:
     - Exact goal and acceptance criteria.
     - Specific file paths it is allowed to modify (respecting module boundaries).
     - Strict instruction to follow `AGENTS.md`.

3. **No File-Lock Collisions**:
   - Never allow two subagents to perform write operations on the same target file at once.

4. **Synthesis & Evidence Gate**:
   - The primary/lead agent must review subagent reports, verify diffs, and run automated verification commands (`npm run build`, `node scripts/test-concurrency.js`) before declaring completion.

---

## 🛡️ 3. Safety & Hallucination Prevention
- **Evidence Before Assertion**: An agent must never claim code works or tests pass without running the command and reading the real exit code and stdout.
- **Single Source of Truth**: Agents must check PostgreSQL schemas and live project status in `docs/PROJECT-STATE.md` rather than assuming schema structures.

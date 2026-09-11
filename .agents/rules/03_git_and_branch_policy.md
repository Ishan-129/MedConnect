# Rule 03: Git Cleanliness, Branching & Prompt Execution Workflow

## 🔄 Standard Branch Hierarchy & Promotion Flow
```text
[ Feature Branch (dev1/*, dev2/*, dev3/* or feat/*) ]
                  │
                  ▼ (Prompt-by-prompt incremental commits)
                  │
                  ▼ (Successful local build / validation check)
[ dev branch ] ──► (Integration testing & concurrency checks)
                  │
                  ▼ (All checks passing 100%)
[ main branch ] ──► (Production / Demo Day Release)
```

---

## 📋 Step-by-Step Developer Workflow

### 1. Start in Feature-Specific Branch
Every developer must start their work on their assigned feature branch:
- **Dev 1 (AI & n8n)**: `git checkout -b dev1/n8n-<feature>` or `feat/ai-<feature>`
- **Dev 2 (Supabase & DB)**: `git checkout -b dev2/db-<feature>` or `feat/backend-<feature>`
- **Dev 3 (Frontend UX)**: `git checkout -b dev3/ui-<feature>` or `feat/frontend-<feature>`

### 2. Prompt-by-Prompt Execution & Incremental Commits
- Feed your phase prompt to your AI coding assistant.
- After each prompt's code is successfully generated and verified locally, create an immediate incremental commit:
  ```bash
  git add <modified-files-in-your-scope>
  git commit -m "feat(<module>): <descriptive prompt task summary>"
  ```
- *Never pile up uncommitted code across multiple prompts.*

### 3. Build & Test Verification before Pushing to `dev`
- When the last prompt of the phase/feature is completed:
  - **Dev 3 (Frontend)**: Run `npm run build` inside `frontend/` (must complete with 0 errors).
  - **Dev 2 (Backend)**: Run `node scripts/test-concurrency.js` & `node scripts/healthcheck.js`.
  - **Dev 1 (AI/n8n)**: Validate JSON schema against `ai-services/intent-schema.json`.
- Once verified, push the feature branch and merge into `dev`:
  ```bash
  git push origin <feature-branch>
  # Merge into dev branch (via Pull Request or fast-forward merge)
  ```

### 4. Integration Verification in `dev` & Promotion to `main`
- In `dev` branch, test the integrated system end-to-end (Frontend + Backend + AI workflows).
- Once all verification passes on `dev`, merge `dev` into `main`:
  ```bash
  git checkout main
  git merge dev
  git push origin main
  ```

### 5. Non-Negotiables
- **Never push directly to `main`**.
- **Never commit `.env` or secrets**. Use `.env.example`.
- **Stay in your designated directory scope**.


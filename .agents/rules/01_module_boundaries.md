---
trigger: always_on
---

# Rule 01: Module Scope & Ownership Boundaries

1. **Dev 1 Scope**:
   - Authorized Directories: `ai-services/`, `n8n-workflows/`
   - Responsibilities: Sarvam AI STT, OpenAI receptionist prompts, intent schema validation, n8n workflows (booking, queue engine, emergency broadcast, escalation timeout), Telegram bot integration.
   - Forbidden: Direct edits to `frontend/` or `backend/migrations/`.

2. **Dev 2 Scope**:
   - Authorized Directories: `backend/`, `scripts/`
   - Responsibilities: Supabase PostgreSQL schema, migrations (`001_core_schema.sql`, `002_geo_and_emergency.sql`), atomic RPCs (`book_appointment_atomic`, `accept_emergency_request`), Haversine distance functions, seed data, and concurrency test harness (`scripts/test-concurrency.js`).
   - Forbidden: Direct edits to `frontend/` or `n8n-workflows/`.

3. **Dev 3 Scope**:
   - Authorized Directories: `frontend/`, `docs/`
   - Responsibilities: React + Vite application, Multilingual Voice Booking widget, QR Token modal, Realtime Live Queue tracker, Emergency Dispatch Center, Hospital Radar view, Digital Emergency QR pass.
   - Forbidden: Direct edits to `backend/migrations/` or `n8n-workflows/`.

4. **Cross-Module Communication**:
   - If a frontend view needs a new DB column or RPC, Dev 3 must request Dev 2 to add it in `backend/migrations/`.
   - If n8n needs a new schema field, Dev 1 and Dev 2 must agree via `ai-services/intent-schema.json`.

# GitHub Copilot Instructions for MedConnect Pulse

## Project Overview
MedConnect Pulse is a real-time event-driven healthcare queue and emergency dispatch system with Supabase PostgreSQL as the single source of truth.

## Module Ownership
- `ai-services/`, `n8n-workflows/` -> Dev 1 (@AYANK1510)
- `backend/`, `scripts/` -> Dev 2 (@Thorin1907)
- `frontend/`, `docs/` -> Dev 3 (@Ishan-129)

## Critical Constraints
- **Atomic Operations**: Always use Supabase RPCs (`book_appointment_atomic`, `accept_emergency_request`) for slot booking and emergency claiming. Never use client-side check-then-write logic.
- **Single Source of Truth**: UI listens to Supabase Realtime changes and reflects database state directly.
- **Validation**: LLM outputs conform to `ai-services/intent-schema.json`.
- **Environment**: Secrets reside in `.env`. Reference `.env.example`.

## Common Commands
- Frontend Run: `cd frontend && npm run dev`
- Frontend Build Check: `cd frontend && npm run build`
- Concurrency Check: `node scripts/test-concurrency.js`

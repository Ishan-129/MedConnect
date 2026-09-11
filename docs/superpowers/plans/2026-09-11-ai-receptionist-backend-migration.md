# Phase 1: Migrate Complete AI Receptionist Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the complete AI Receptionist backend functionality from `medconnect-main` into MedConnect Pulse without replacing existing UI markup.

**Architecture:** A robust Node backend server in `backend/server.js` exposing REST endpoints with real Supabase DB access and atomic `book_appointment_atomic` RPC execution, supported by backend services (`receptionistService`, `openaiService`, `sarvamService`, etc.), matched frontend services in `frontend/src/services/`, and an automated test suite in `scripts/test-receptionist-backend.js`.

**Tech Stack:** Node.js, Express/HTTP, Supabase PostgreSQL, Sarvam AI (`saaras:v1`), OpenAI (`gpt-4o-mini`), n8n (`WF1_ai_receptionist_booking.json`), Vite 6, TypeScript 5.

---

## Task 1: Environment & Dependencies Setup
- Create `.env` and `frontend/.env` with verified live credentials.
- Add scripts to root `package.json` (`"backend": "node backend/server.js"`, `"test:receptionist": "node scripts/test-receptionist-backend.js"`).
- Install `@supabase/supabase-js` and `qrcode` in `frontend/package.json`.

## Task 2: Unified Database Layer
- Create `backend/db.js` supporting direct Supabase queries, `book_appointment_atomic` RPC, and in-memory fallback seeded with Delhi-NCR data (`backend/seed.sql`).

## Task 3: Backend Services Layer
- Migrate `backend/services/sarvamService.js` (Audio processing, Saaras STT).
- Migrate `backend/services/openaiService.js` (GPT-4o-mini extraction + Indic NLP fallback updated for Delhi-NCR seed doctors).
- Migrate `backend/services/appointmentService.js` (Slot lookup, atomic booking, cancellation, rescheduling).
- Migrate `backend/services/hospitalService.js` (Hospitals, departments, doctor search).
- Migrate `backend/services/queueService.js` (Live queue position and wait time calculation).
- Migrate `backend/services/authService.js` (Staff login and role-based access).
- Migrate `backend/services/qrService.js` (HMAC-signed QR passes).
- Migrate `backend/services/n8nService.js` (WF1 webhook integration).
- Migrate `backend/services/notificationService.js` (Telegram alerts & notifications).
- Migrate `backend/services/receptionistService.js` (Master turn processor, 9 intents, context tracking, multilingual translations).

## Task 4: Backend API Server
- Create `backend/server.js` exposing all endpoints (`/api/receptionist/*`, `/api/doctors`, `/api/departments`, `/api/hospitals`, `/api/appointments/*`, `/api/queue/*`, `/api/dues`, `/api/auth/*`, reverse proxies for `/api/sarvam`, `/api/openai`, `/api/n8n`).

## Task 5: Frontend Service Integration & Proxy
- Port client-side services to `frontend/src/services/` (`speechRecognitionService.ts`, `sarvamService.ts`, `openaiService.ts`, `receptionistService.ts`, `qrService.ts`).
- Update `frontend/src/lib/supabase.ts` with real Supabase client and fallback.
- Configure `frontend/vite.config.ts` with `/api` proxy to backend port 3001.

## Task 6: Verification & End-to-End Testing
- Create and run `scripts/test-receptionist-backend.js`.
- Run `scripts/test-concurrency.js`.
- Run `npm --prefix frontend run build`.
- Validate live backend and frontend startup.

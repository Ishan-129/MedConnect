# MedConnect Pulse — Connecting Care When Seconds Count

> **Hackathon Theme:** Best Use of n8n — Healthcare Automation  
> **Team:** 4 Bit Minds (JIMS Engineering Management Technical Campus)  
> **Team Leader:** Ayank Kumar

---

## 🏥 Architecture: Two Connected Pillars

MedConnect Pulse turns isolated hospitals into a connected regional emergency safety net via an event-driven n8n automation engine:

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 MedConnect Pulse Platform               │
                  └───────────────────────────┬─────────────────────────────┘
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
     ┌───────────────────────────────┐                 ┌───────────────────────────────┐
     │           PILLAR 1            │                 │           PILLAR 2            │
     │   AI Receptionist & Queue     │                 │   Emergency Supply Dispatch   │
     ├───────────────────────────────┤                 ├───────────────────────────────┤
     │ • Indic Voice Intake (Sarvam) │                 │ • 10km Haversine Geo-Radar    │
     │ • Admin Agent (GPT-4o-mini)   │                 │ • 1-Click Telegram Broadcast  │
     │ • Atomic Slot Booking         │                 │ • Instant Stock Lock RPC      │
     │ • QR Pass (#MED-4029)         │                 │ • Tamper-Proof Dispatch QR    │
     │ • Realtime Live Queue Tracker │                 │ • 180s Auto-Escalation Call   │
     └───────────────────────────────┘                 └───────────────────────────────┘
```

---

## 👥 Team Allotment & Git Branching Guide

To ensure zero merge conflicts during the hackathon, each member works on their dedicated feature branch corresponding to their assigned layer and module boundary:

| Developer | Allotted Role & Module | Dedicated Branch | Primary Working Directories |
|---|---|---|---|
| **Ayank Kumar** (Team Leader) | **Layer 1:** AI Receptionist (Voice Intake, Sarvam STT, Intent Agent, Telegram Bot, Booking WF1) | `feature/ai-receptionist` | `ai-services/`, `n8n-workflows/`, `frontend/src/views/ReceptionistView.tsx` |
| **Ishan Varshney** (Backend Lead) | **Layer 1:** Live Queue Engine & Core DB (QR Check-in, Queue State Machine, Supabase Migrations, WF2, WF3) | `feature/live-queue` | `backend/`, `scripts/`, `frontend/src/views/QueueView.tsx` |
| **Ishaan Sama** (Frontend Engineer) | **Layer 2:** Emergency Dispatch UI & Hospital Radar (Radar Map, Live Alerts, Dispatch QR Pass) | `feature/emergency-dispatch-ui` | `frontend/src/views/EmergencyView.tsx`, `frontend/src/components/` |
| **Bhavya Gupta** (Integration & QA) | **Layer 2:** Emergency Backend, n8n Broadcast, Stock Lock RPC & Escalation (WF4-WF7, Concurrency Tests) | `feature/emergency-dispatch-backend` | `n8n-workflows/`, `backend/migrations/`, `scripts/` |

### How to Create & Work on Your Branch:

```bash
# 1. Clone or pull the initialized repository
git checkout main

# 2. Create and switch to your allotted feature branch:
# For Dev 1 (Ayank Kumar):
git checkout -b feature/ai-receptionist

# For Dev 2 (Ishan Varshney):
git checkout -b feature/live-queue

# For Dev 3 (Ishaan Sama):
git checkout -b feature/emergency-dispatch-ui

# For Dev 4 (Bhavya Gupta):
git checkout -b feature/emergency-dispatch-backend

# 3. Work on your files, commit frequently with clear messages:
git add .
git commit -m "feat(module): description of feature"

# 4. Push to remote:
git push -u origin <your-branch-name>
```

---

## 📂 Repository Layout

```
MedConnect/
├── .env.example                     # Environment template
├── .gitignore                       # Standard ignore rules
├── README.md                        # Master repository documentation
├── package.json                     # Root scripts runner
│
├── frontend/                        # React 18 + Vite + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── components/              # Header, Navbar, Radar, QR Modal, Badges
│   │   ├── views/
│   │   │   ├── LandingPage.tsx      # Master Landing Page & Team Dashboard
│   │   │   ├── ReceptionistView.tsx # Dev 1: Multilingual Voice Receptionist
│   │   │   ├── QueueView.tsx        # Dev 2: Live Queue & OPD Management
│   │   │   └── EmergencyView.tsx    # Dev 3/4: 10km Radar & Emergency Dispatch
│   │   ├── lib/                     # Haversine formula, Supabase client, Mock data
│   │   └── types/                   # Shared TypeScript interfaces
│   └── vite.config.ts
│
├── backend/                         # Supabase PostgreSQL Database & Stored Procedures
│   ├── migrations/
│   │   ├── 001_core_schema.sql      # Core tables, slots, appointments, queue
│   │   └── 002_geo_and_emergency.sql# Geo-distance RPCs, atomic lock RPCs, dispatches
│   └── seed.sql                     # Real Delhi-NCR hospitals (AIIMS, Safdarjung, Max)
│
├── ai-services/                     # Receptionist LLM & Voice Integration
│   ├── intent-schema.json           # Contract for appointment booking intent
│   ├── receptionist-prompt.md       # Administrative prompt rules for gpt-4o-mini
│   └── sarvam-stt-config.json       # Sarvam Saaras v1 model configuration
│
├── n8n-workflows/                   # Automated n8n Workflows (WF1 - WF7)
│   ├── README.md                    # Webhook contracts & credential mapping
│   ├── WF1_ai_receptionist_booking.json
│   ├── WF2_appointment_qr_checkin.json
│   ├── WF3_live_queue_engine.json
│   ├── WF4_emergency_request_broadcast.json
│   ├── WF5_emergency_accept_and_lock.json
│   ├── WF6_emergency_qr_handover.json
│   └── WF7_emergency_timeout_escalation.json
│
└── scripts/                         # Testing & Utilities
    ├── seed-db.js                   # Seed runner
    └── test-concurrency.js          # Concurrency test harness for atomic locks
```

---

## ⚡ Quick Start

### 1. Run Frontend Application
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` to explore the interactive Landing Page and all 3 module studios.

### 2. Setup Database (Supabase)
Copy the SQL files in order into the Supabase SQL editor:
1. `backend/migrations/001_core_schema.sql`
2. `backend/migrations/002_geo_and_emergency.sql`
3. `backend/seed.sql`

---

## 🛡️ Non-Negotiable Medical & Architectural Rules

1. **Administrative Only:** The AI receptionist handles scheduling and routing. It NEVER diagnoses, prescribes medications, or provides clinical triage.
2. **Zero Paid Maps API:** Hospital distance calculations use the Haversine formula directly in PostgreSQL (`calculate_distance_km`) and frontend canvas.
3. **Double-Booking & Double-Allocation Prevention:** All writes use atomic transactions with row locks (`FOR UPDATE`).
4. **Idempotent QR Passes:** Every QR payload is signed with an HMAC secret and can only be redeemed once.

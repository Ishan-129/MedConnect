# n8n Workflows Reference — MedConnect Pulse

This directory contains the automation workflow templates for MedConnect Pulse. Each workflow maps directly to a core operational process defined in the project specification.

## Workflow Overview

| Workflow | Name | Trigger Endpoint | Primary Integrations | Responsible Role |
|---|---|---|---|---|
| **WF1** | AI Receptionist / Voice Booking | `POST /webhook/receptionist` | Sarvam AI STT (`saaras:v1`), OpenAI (`gpt-4o-mini`), Supabase, Telegram | Dev 1 (Ayank Kumar) |
| **WF2** | Appointment Check-In | `POST /webhook/appointment-checkin` | QR HMAC verification, Supabase `queue_entries`, Telegram | Dev 2 (Ishan Varshney) |
| **WF3** | Live Queue State Machine | `POST /webhook/queue-event` | Supabase Realtime, Position recalculation, Telegram notifications | Dev 2 (Ishan Varshney) |
| **WF4** | Emergency Request Broadcast | `POST /webhook/emergency-request` | Haversine Geo-filter, Telegram Bot inline alert, 180s timer trigger | Dev 3 & Dev 4 (Ishaan & Bhavya) |
| **WF5** | Emergency Accept & Stock Lock | `POST /webhook/emergency-accept` | Atomic RPC `accept_emergency_request`, Dispatch QR generation, Telegram | Dev 3 & Dev 4 (Ishaan & Bhavya) |
| **WF6** | Emergency QR Handover Checkpoint | `POST /webhook/emergency-verify-dispatch` | QR HMAC validator, Dispatches table update, Inventory release | Dev 3 & Dev 4 (Ishaan & Bhavya) |
| **WF7** | Emergency Escalation Timeout | `POST /webhook/emergency-timeout` | Twilio Voice fallback call, Regional coordinator alert, Exceptions table | Dev 3 & Dev 4 (Ishaan & Bhavya) |

---

## Required n8n Credentials

Configure the following credentials in your local or hosted n8n instance:
1. `supabase_app_db`: Supabase PostgreSQL connection or REST API credentials.
2. `sarvam_ai_api`: Sarvam AI bearer token (`SARVAM_API_KEY`).
3. `openai_api`: OpenAI bearer token (`OPENAI_API_KEY`).
4. `telegram_alert_bot`: Telegram Bot token for emergency broadcast.
5. `twilio_voice_api`: Twilio Account SID & Auth Token for escalation voice calls.

---

## Standard Webhook Envelope Contract

All webhooks return a predictable JSON response structure:

```json
{
  "status": "ok",
  "data": {},
  "error_code": null,
  "correlation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "timestamp": "2026-09-09T22:30:00.000Z"
}
```

In error cases:
```json
{
  "status": "error",
  "data": null,
  "error_code": "INSUFFICIENT_INVENTORY",
  "message": "The requested resource has already been committed to another emergency request.",
  "correlation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "timestamp": "2026-09-09T22:30:00.000Z"
}
```

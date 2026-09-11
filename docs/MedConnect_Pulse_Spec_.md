# MedConnect Pulse — AI-Agent Build Specification (Refined v2)

> **How to use this document:** This is the single source-of-truth build spec. A companion pitch
> deck (`project-ppt.pdf`) exists for hackathon judging narrative only — it is not a functional
> spec and conflicts with this document in a couple of places (resolved in §0.1 below). Read
> §0.1–§0.5 first; they exist specifically to remove ambiguity that a build agent would otherwise
> have to guess at.

**Project metadata:** Hackathon theme — "Best Use of n8n — Healthcare Automation." Team: 4 Bit
Minds (JIMS Engineering Management Technical Campus). This metadata is background context only and
does not affect functional requirements below.

## 0. PROJECT CONTEXT

Project: **MedConnect Pulse**

Purpose: Build an n8n-powered healthcare automation platform with two connected pillars:

1. **AI Receptionist + Live Queue Engine**
2. **Emergency Supply Dispatch / Hospital Resource Exchange**

The system connects patients, receptionists, doctors, and nearby hospitals through automated workflows.

Primary stack from the project specification:
- n8n — workflow/orchestration engine
- Sarvam AI — multilingual speech-to-text / voice layer
- Gemini — intent understanding and administrative agent logic
- Supabase — application database
- React + Vite — web dashboards
- Telegram — patient notifications
- Telegram — hospital emergency alerts and actions
- Twilio — emergency voice escalation (CHECK IF NEEDED OR NOT)
- QR codes — appointment check-in and emergency dispatch verification
- Geo-filter/Haversine logic — nearby hospital discovery

IMPORTANT:
- This is an administrative/operational automation system.
- The AI must NOT diagnose, prescribe, interpret clinical results, change medication, or make autonomous clinical triage decisions.
- Use REAL DATA FOR DEMO ALSO NO DEMO DEMO DATA CAN ONLY BE USED FOR INTERNAL TESTING .
- Do not invent appointment slots, patient facts, inventory, or hospital data.
- Production integrations must use hospital-approved systems, credentials, APIs, policies, and security controls.

---

## 0.1 CROSS-CHECK: PITCH DECK vs. THIS SPEC — RESOLVED CONFLICTS

An AI agent building this project may be given the pitch deck (`project-ppt.pdf`) alongside this
spec. The two documents disagree in a few places. **This spec is the source of truth.** Resolutions:

| Topic | Pitch deck says | This spec says | Resolution for build |
|---|---|---|---|
| Emergency geo-filter radius | Slide 1–4 say **10 km**; Slide 5 tech-stack icon says **"15km Filter"** | "configurable radius, 10 km example" | Default = **10 km**, stored as a per-deployment config value (`EMERGENCY_RADIUS_KM`), not hardcoded. The "15km" on the tech-stack slide is a slide error — do not implement 15 km as a hidden default. |
| STT model | "Sarvam AI · saaras:v1" | "Sarvam AI — multilingual speech-to-text" (no version pinned) | Pin to **`saaras:v1`** unless a newer Sarvam STT model is explicitly approved. |
| Intent/agent model | "gpt-4o-mini" | "OpenAI — intent understanding" (no version pinned) | Pin to **`gpt-4o-mini`** for the administrative agent. Do not silently upgrade model versions without updating this spec, since prompt behavior and cost both change with model choice. |
| Escalation timeout | "3 minutes" (fixed in diagrams) | "3-minute timeout... should be configurable" | Default = **180 seconds**, exposed as config `EMERGENCY_RESPONSE_TIMEOUT_SEC`. Diagrams may hardcode "3 min" for demo narration; the code must not hardcode it. |
| Emergency dispatch check-in | Deck implies QR is scanned by "ambulance/delivery" at the *supplying* hospital | Spec section 8 confirms: QR is scanned at the **supplying hospital**, authorizing that hospital to hand the resource to the courier/ambulance | No conflict — spec is more precise, use it. |
| Languages supported | Deck says "any Indic language" | Spec does not enumerate languages | See §0.3 below — enumerate explicitly rather than relying on "any language" as an implementation target. |

If any other discrepancy between the deck and this spec is found during implementation, **this spec wins**, and the deck should be treated as marketing narrative, not a functional requirement.

---

## 0.2 ENVIRONMENT & CREDENTIALS (REQUIRED BEFORE BUILD)

The AI agent must NOT hardcode any of the following in workflow JSON, frontend code, or prompts.
All must be stored as n8n credentials / environment variables and referenced by name.

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | All workflows, frontend | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | n8n backend workflows only | Never expose to frontend |
| `SUPABASE_ANON_KEY` | React dashboards | Public, but still respects RLS policies |
| `OPENAI_API_KEY` | WF1 (intent agent) | Model: `gpt-4o-mini` |
| `SARVAM_API_KEY` | WF1 (speech-to-text) | Model: `saaras:v1` |
| `TELEGRAM_BOT_TOKEN` | Emergency alert bot, hospital manager bot | One bot per environment (demo vs prod) |
| `TELEGRAM_ALERT_CHAT_MAP` | Geo-filter → broadcast step | Maps `hospital_id → telegram_chat_id`; stored in `hospitals` table, not in workflow code |
| `TELEGRAM` / `TELEGRAM` | Patient notifications | Via Telegram Business API or approved BSP |
| `TWILIO_ACCOUNT_SID` | Escalation calls | |
| `TWILIO_AUTH_TOKEN` | Escalation calls | |
| `TWILIO_FROM_NUMBER` | Escalation calls | |
| `QR_SIGNING_SECRET` | QR generation/validation | HMAC secret used to sign QR payloads so a QR cannot be forged or replayed (see §0.4) |
| `N8N_WEBHOOK_BASE_URL` | Frontend → n8n triggers | Public base URL (use a tunnel such as ngrok/Cloudflare Tunnel for local hackathon demos) |

Do not commit `.env` files. Use n8n's built-in credential store for every API key above.

---

## 0.3 CONFIGURATION DEFAULTS

| Setting | Default | Config key |
|---|---|---|
| Emergency geo-filter radius | 10 km | `EMERGENCY_RADIUS_KM` |
| Emergency response timeout before escalation | 180 s (3 min) | `EMERGENCY_RESPONSE_TIMEOUT_SEC` |
| Appointment slot lock hold time (pending confirmation) | 120 s | `SLOT_HOLD_TIMEOUT_SEC` |
| QR dispatch pass validity window | 60 min from generation | `DISPATCH_QR_TTL_MIN` |
| Appointment QR validity window | Appointment date, ±configurable grace period | `APPOINTMENT_QR_GRACE_MIN` |
| Supported voice languages (demo scope) | Hindi (`hi-IN`), English (`en-IN`) — extend via Sarvam's supported language list before adding more | `SUPPORTED_LANGUAGES` |
| Coordinate format for all lat/lng fields | Decimal degrees, `(latitude, longitude)` order, WGS84 | n/a |

Do not implement "any language" as a literal requirement — always work from an explicit, testable
list of supported language codes, and route anything else to `NEEDS_HUMAN_REVIEW`.

---

## 0.4 GEO-FILTER FORMULA (NO MAPS API)

Distance between requesting hospital and each candidate hospital uses the **Haversine formula**:

```
a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlon/2)
c = 2 · atan2(√a, √(1−a))
distance_km = R · c        where R = 6371 (Earth's mean radius in km)
```

- Latitude/longitude must be converted to radians before use.
- A hospital is **eligible** if: `distance_km <= EMERGENCY_RADIUS_KM` AND `hospital.active_status = true` AND `hospital.supported_resource_categories` includes the requested `resource_type`.
- Implement this as an n8n Code node (or a Postgres function called from Supabase) — no external Maps/Distance API call is required or permitted for this calculation, per the "zero paid Maps API" design goal.

---

## 0.5 CHANNEL MATRIX

Clarifies which channel does what, since the deck and spec both describe multiple channels
without a single table.

| Channel | Patient voice/text input | Patient notifications | Hospital emergency alerts | Hospital accept/reject actions | Escalation |
|---|---|---|---|---|---|
| Web mic / widget | ✅ | — | — | — | — |
| Telegram | ✅ (where supported) | ✅ (confirmations, queue turn) | — | — | — |
| Telegram | ✅ (voice notes, where supported) | — | ✅ (broadcast + inline buttons) | ✅ (Accept & Supply / Reject) | — |
| Twilio voice | — | — | — | — | ✅ (timeout escalation call only) |
| Portal (React dashboard) | — | ✅ (live queue status) | ✅ (Hospital Emergency Dashboard) | ✅ (mirrors Telegram actions) | — |

If a channel integration is unavailable during the hackathon build (e.g., Telegram Business API
approval pending), fall back to a mock/demo adapter per §26 rule 5, and clearly label it as mocked
in the demo — do not silently drop the feature.

---

# 1. AI RECEPTIONIST

## Context

Patients should be able to interact with the hospital without depending entirely on a manual receptionist for routine appointment tasks.

The AI receptionist should understand the patient's language, collect the reason for the visit, help route the patient to an appropriate department/doctor, check available appointment slots, and book only after patient confirmation.

## Input Channels

Build support for:
- Web microphone / voice widget
- Telegram voice/input where supported
- Telegram voice notes where supported
- Text input as fallback

## Main Process

Patient
→ Voice/Text Input
→ Sarvam AI speech processing
→ Text/normalized input
→ OpenAI administrative agent
→ Understand intent
→ Collect patient details
→ Ask reason/symptoms
→ Suggest suitable department/doctor
→ Show available slots
→ Patient confirms
→ Verify slot from scheduling source
→ Create appointment
→ Generate token + QR
→ Send confirmation to registered number
→ Log the complete workflow

## Features

### 1.1 Multilingual Voice Support
Context:
Patients may speak Indian/regional languages.

Process:
Voice input
→ Sarvam AI
→ Speech-to-text
→ normalized text
→ AI agent

Requirement:
Preserve the user's meaning. Do not make clinical conclusions from speech.

### 1.2 One-to-One Voice Agent
Context:
The patient should have a conversational interaction rather than filling a long form.

Process:
Patient speaks
→ AI understands
→ AI asks required administrative questions
→ Patient responds
→ conversation continues until enough information is collected.

Fallback:
If the request is ambiguous, clinically sensitive, or unsupported, route to human review.

### 1.3 Patient Information Collection
Collect only necessary information, such as:
- Name
- Registered phone number
- Existing/new patient status
- Department or reason for visit
- Preferred date
- Preferred time if provided

Do not request unnecessary sensitive information.

### 1.4 Reason/Symptom Collection
Context:
The patient explains why they want an appointment.

Process:
AI asks for the reason/symptoms
→ extracts administrative routing information
→ uses it only to suggest relevant department/doctor.

IMPORTANT:
This is NOT diagnosis.
The AI must not say the patient has a disease or prescribe treatment.

### 1.5 Doctor Suggestion
Context:
Help the patient select an appropriate doctor.

Process:
Collected reason/symptom + available department/doctor mapping
→ suggest one or more appropriate doctors
→ patient selects doctor.

Doctor selection must use configured hospital data.
Never invent a doctor.

### 1.6 Appointment Slot Lookup
Context:
The AI must never invent availability.

Process:
Selected doctor/department + preferred date
→ scheduling API/database
→ return available slots
→ display actual slots.

If no slot:
- show available alternatives if returned by the scheduling system
- otherwise send to human review.

### 1.7 Appointment Booking
Process:
Patient selects slot
→ final confirmation
→ verify slot is still available
→ create appointment
→ store appointment ID
→ generate token and QR.

Prevent double booking with an appointment/slot locking mechanism.

### 1.8 Appointment Token
Generate a unique token such as:
`#MED-4029`

Store:
- token
- appointment ID
- patient ID
- doctor ID
- date/time
- status

### 1.9 Appointment QR Code
Generate QR after confirmed booking.

QR should represent a secure appointment/check-in reference, not expose unnecessary patient data.

The QR will later be scanned at hospital reception.

**QR payload schema (appointment check-in QR):**
```json
{
  "type": "appointment_checkin",
  "appointment_id": "uuid",
  "issued_at": "ISO8601",
  "exp": "ISO8601"
}
```
Sign the payload (e.g., HMAC using `QR_SIGNING_SECRET`) or use a short-lived signed token/opaque
reference instead of embedding raw appointment data in plain text, so the QR cannot be forged or
replayed. Validate the signature before trusting any field on scan.

### 1.10 Patient Notification
After booking:
- Send appointment confirmation to registered phone number.
- Include hospital name, doctor, date/time, token, and check-in instructions as approved by the hospital.

Use Telegram/API or approved communication channel.

### 1.11 Appointment Logs
Every important action should be logged:
- appointment created
- notification sent
- QR generated
- errors
- status changes

Use correlation IDs for workflow tracing.

---

# 2. LIVE QUEUE ENGINE

## Context

Booking an appointment is different from physically arriving at the hospital.

A patient becomes part of the live physical queue only after checking in at reception using the appointment QR.

## Main Process

Appointment already booked
→ Patient receives QR
→ Patient reaches hospital
→ Patient scans QR at reception
→ Appointment verified
→ Patient marked checked-in
→ Patient added to live queue
→ Queue position calculated
→ Patient sees live queue status
→ Receptionist controls queue
→ Doctor sees upcoming patients
→ Patient is called
→ Consultation completed
→ Queue moves forward

## Features

### 2.1 QR Check-In
Reception scans patient's appointment QR.

System verifies:
- QR validity
- appointment ID/reference
- appointment date
- appointment status
- hospital
- check-in eligibility

If valid:
→ mark checked-in
→ add to queue.

If invalid:
→ reject check-in
→ show error
→ optionally create human-review/exception record.

### 2.2 Live Queue
Maintain queue records with:
- queue ID
- appointment ID
- patient ID
- token
- doctor ID
- department
- check-in time
- queue position
- queue status

Suggested statuses:
- BOOKED
- CHECKED_IN
- WAITING
- CALLED
- IN_CONSULTATION
- COMPLETED
- SKIPPED
- CANCELLED
- NO_SHOW

### 2.3 Patient Queue View
Patient can view:
- token
- current queue position
- patients ahead
- doctor
- department
- appointment status
- estimated/wait status if available
- turn notification

Do not expose other patients' personal information.

### 2.4 Receptionist Queue Dashboard
Receptionist has full queue control.

Features:
- View all checked-in patients
- View current patient
- View next patient
- Call next patient
- Skip patient
- Mark patient arrived
- Mark consultation started
- Mark completed
- Handle cancellations/no-shows
- View queue by doctor/department

Primary action:
`CALL NEXT PATIENT`

### 2.5 Doctor Queue Dashboard
Doctor can see:
- current patient
- next patient
- upcoming patients
- token
- appointment time
- basic approved administrative information
- queue status

Doctor does not need full reception controls.

### 2.6 Queue Notifications
When queue changes:
- update patient dashboard
- optionally send approved Telegram notification
- notify patient when their turn is approaching.

### 2.7 Queue Consistency
The queue must update safely when:
- two receptionists act at the same time
- a patient is skipped
- appointment is cancelled
- patient checks in late
- doctor changes status
- network/API request repeats.

Use database constraints/transactions where possible.

---

# 3. EMERGENCY SUPPLY DISPATCH

## Context

Hospital A may suddenly lack a critical resource such as:
- blood
- oxygen
- ICU bed
- ventilator
- medicine
- medical equipment
- ambulance or other configured resources.

Instead of manually calling hospitals one by one, Hospital A creates an emergency request in MedConnect Pulse.

The system finds nearby registered hospitals and broadcasts the request.

## Main Process

Hospital A
→ Create emergency request
→ n8n receives request
→ Find nearby registered hospitals
→ Filter by configurable radius
→ Check relevant resource category/inventory
→ Broadcast emergency request
→ Portal + Telegram
→ Hospital B/C/D receive alert
→ Hospital with available resource accepts
→ Resource is locked/reserved
→ QR dispatch pass generated
→ Ambulance/delivery reaches supplying hospital
→ QR scanned
→ Verify dispatch
→ Release resource
→ Dispatch to Hospital A
→ Update request + audit log

---

# 4. EMERGENCY REQUEST CREATION

## Request Fields

Minimum fields:
- request ID
- requesting hospital
- resource type
- quantity
- priority
- request time
- required-by/urgency information if configured
- contact/authorized requester
- location

Suggested priority values:
- NORMAL
- LOW
- MEDIUM
- HIGH
- CRITICAL
- URGENT
- EMERGENCY

Suggested `resource_type` enum (extend as needed, but keep it a closed enum rather than free text,
so geo-filter/inventory matching stays reliable):
`O_NEG_BLOOD | O_POS_BLOOD | A_NEG_BLOOD | A_POS_BLOOD | B_NEG_BLOOD | B_POS_BLOOD | AB_NEG_BLOOD | AB_POS_BLOOD | OXYGEN | ICU_BED | VENTILATOR | MEDICINE | EQUIPMENT | AMBULANCE`

## Example

Hospital A needs:
`O_NEG_BLOOD — 4 Units`

System creates:
`Emergency Request #ER-1042`

---

# 5. NEARBY HOSPITAL GEO-FILTER

## Context

Only relevant nearby registered hospitals should receive the emergency request.

## Process

Requesting hospital coordinates
+
Registered hospital coordinates
→ Haversine/geographic distance calculation
→ filter by configured radius
→ eligible hospitals list
→ broadcast request.

Current demo specification uses a configurable nearby radius, with the project deck showing a 10 km example.

Do not depend on a paid Maps API for the basic radius calculation.

## Requirements

Hospital must:
- be registered
- be active/online where applicable
- have required resource category configured
- fall inside the configured radius.

---

# 6. EMERGENCY ALERT

Send emergency request through:

### Portal
Show emergency request in the hospital dashboard.

### Telegram
Send alert to registered hospital/authorized emergency manager.

Example UI:

`EMERGENCY REQUEST`
`Hospital A`
`O- Blood`
`4 Units`
`Distance: 6.4 km`

Actions:
- ACCEPT & SUPPLY
- VIEW DETAILS
- REJECT

If rejected:
- require rejection reason
- log reason.

---

# 7. RESOURCE ACCEPTANCE + LOCK

## Context

Multiple hospitals may have the same resource. Once a hospital accepts, the promised inventory must be reserved so it cannot be allocated twice.

## Process

Hospital B clicks:
`ACCEPT & SUPPLY`

→ verify current inventory
→ verify request still active
→ reserve/lock requested quantity
→ create dispatch record
→ generate QR dispatch pass
→ notify both sides.

If inventory is insufficient:
→ acceptance fails
→ keep request active
→ notify requester/next hospitals.

If request was already fulfilled:
→ reject duplicate acceptance.

---

# 8. EMERGENCY QR DISPATCH PASS

## Context

The QR is a physical verification checkpoint before the resource is released.

## Process

Acceptance
→ generate secure QR dispatch pass
→ ambulance/delivery vehicle reaches supplying hospital
→ supplying hospital scans QR
→ backend verifies dispatch
→ if valid, authorize resource handover
→ mark resource as DISPATCHED/RELEASED.

QR should reference the dispatch transaction securely.

Do not put unnecessary patient or hospital-sensitive data directly into the QR.

**QR payload schema (emergency dispatch QR):**
```json
{
  "type": "emergency_dispatch",
  "dispatch_id": "uuid",
  "request_id": "uuid",
  "issued_at": "ISO8601",
  "exp": "ISO8601"
}
```
Sign with `QR_SIGNING_SECRET` (HMAC) so the QR image alone cannot be reconstructed or forged.
Default validity: `DISPATCH_QR_TTL_MIN` (see §0.3). An expired or already-used QR must fail
validation per §9, even if the signature is otherwise valid.

---

# 9. QR VALIDATION

Check:
- QR/dispatch ID
- request ID
- supplying hospital
- receiving hospital
- resource
- quantity
- dispatch status
- expiration/validity
- whether already used.

If valid:
`AUTHORIZED → RELEASE RESOURCE`

If invalid:
`REJECT → DO NOT RELEASE → LOG EXCEPTION`

QR must be idempotent:
A successful dispatch scan must not release the same resource twice.

---

# 10. EMERGENCY ESCALATION

## Context

Emergency requests need fast responses.

## Process

Broadcast request
→ wait configured response window
→ if accepted, continue
→ if no response, escalate.

Current demo flow:
`3-minute timeout`

After timeout:
→ Twilio voice escalation
→ regional coordinator/next escalation contact.

The exact escalation chain should be configurable.

---

# 11. HOSPITAL RESOURCE INVENTORY

Maintain inventory records for resources used by the demo.

Fields may include:
- inventory ID
- hospital ID
- resource type
- quantity available
- quantity reserved
- quantity dispatched
- last updated
- status

Important:
Inventory must support reservation/locking.

Example:

Available: 10
Requested: 4
After acceptance:
Available: 6
Reserved: 4

After verified dispatch:
Reserved: 0
Dispatched: 4

---

# 12. HOSPITAL REGISTRATION

Registered hospitals are the network participants.

Store:
- hospital ID
- hospital name
- location
- latitude
- longitude
- contact details
- emergency contact/Telegram mapping
- active status
- supported resource categories
- verification status.

Hospital verification should be controlled by an authorized administrator.

---

# 13. USER ROLES

## Patient
Can:
- use AI receptionist
- book appointment
- receive QR/token
- check in
- view live queue
- receive notifications.

## Receptionist
Can:
- view/manage patient queue
- scan appointment QR
- call next patient
- update queue status
- handle exceptions.

## Doctor
Can:
- view current/upcoming queue
- see next patient
- update appropriate consultation/queue status.

## Hospital Emergency Manager
Can:
- receive emergency requests
- accept/reject requests
- confirm resource availability
- manage emergency dispatch.

## Hospital Admin
Can:
- manage hospital profile
- manage doctors
- manage departments
- manage resources
- manage staff access
- view audit logs.

---

# 14. DATABASE CORE ENTITIES

Use Supabase/Postgres.

Minimum tables:

### hospitals
- hospital_id
- name
- latitude
- longitude
- contact
- status
- verification_status

### users
- user_id
- hospital_id
- role
- name
- phone
- status

### patients
- patient_id
- name
- phone
- email if required
- consent_status
- created_at
- updated_at

### doctors
- doctor_id
- hospital_id
- department_id
- name
- active_status

### departments
- department_id
- hospital_id
- name

### doctor_slots
- slot_id
- doctor_id
- start_time
- end_time
- status

### appointments
- appointment_id
- patient_id
- doctor_id
- department_id
- slot_start (store as `timestamptz`, always UTC in the DB; convert to hospital-local time only for display)
- slot_end (`timestamptz`)
- token
- qr_reference
- status
- created_at

Note: store all timestamps as `timestamptz` (UTC) in Supabase/Postgres. Convert to the hospital's
local timezone only in the frontend/notification layer, never mix naive and timezone-aware timestamps.

### queue_entries
- queue_id
- appointment_id
- patient_id
- doctor_id
- token
- position
- check_in_at
- status

### resources
- resource_id
- hospital_id
- resource_type
- quantity_available
- quantity_reserved
- quantity_dispatched
- updated_at

### emergency_requests
- request_id
- requesting_hospital_id
- resource_type
- quantity
- priority
- status
- created_at
- expires_at

### emergency_responses
- response_id
- request_id
- supplying_hospital_id
- status
- rejection_reason
- accepted_at

### dispatches
- dispatch_id
- request_id
- supplying_hospital_id
- receiving_hospital_id
- resource_type
- quantity
- qr_reference
- status
- verified_at

### communication_logs
- message_id
- patient/hospital reference
- channel
- template
- workflow
- delivery_status
- timestamp
- correlation_id

### exceptions
- exception_id
- workflow
- record_id
- error_type
- severity
- owner
- status
- resolution_note
- created_at

### audit_logs
- event_id
- workflow
- actor_type
- action
- record_id
- timestamp
- correlation_id

---

# 15. n8n WORKFLOWS TO BUILD

## WF1 — AI Receptionist / Appointment

`Voice/Text Input`
→ `Sarvam`
→ `Normalize Input`
→ `OpenAI Agent`
→ `Collect/Validate Details`
→ `Doctor/Department Suggestion`
→ `Slot Lookup`
→ `Slot Available?`
→ `Patient Confirmation`
→ `Reserve/Create Appointment`
→ `Generate Token`
→ `Generate QR`
→ `Send Notification`
→ `Communication Log`
→ `Audit Log`

## WF2 — Appointment Check-In

`QR Scan`
→ `Validate Appointment`
→ `Already Checked In?`
→ `Create Queue Entry`
→ `Calculate Position`
→ `Update Patient Dashboard`
→ `Audit Log`

## WF3 — Live Queue

`Queue Event`
→ `Recalculate Queue`
→ `Update Positions`
→ `Notify Patient`
→ `Update Reception Dashboard`
→ `Update Doctor Dashboard`
→ `Audit Log`

## WF4 — Emergency Request

`Hospital Creates Request`
→ `Validate Request`
→ `Geo Filter`
→ `Find Eligible Hospitals`
→ `Broadcast Portal + Telegram`
→ `Start Timeout`
→ `Wait for Acceptance`
→ `Accepted?`
→ YES: Resource Lock
→ NO: Escalation

## WF5 — Emergency Acceptance

`Portal/Telegram Accept`
→ `Validate Request`
→ `Check Inventory`
→ `Lock Resource`
→ `Create Dispatch`
→ `Generate QR`
→ `Notify Supplying + Requesting Hospital`
→ `Audit Log`

## WF6 — Emergency QR Handover

`QR Scan`
→ `Validate Dispatch`
→ `Already Used?`
→ `Authorized?`
→ YES: Release/Dispatch Resource
→ Update Inventory
→ Update Request
→ Notify Hospital A
→ Audit Log

## WEBHOOK PAYLOAD EXAMPLES (for the trigger nodes above)

**WF1 trigger — appointment intent request** (`POST {N8N_WEBHOOK_BASE_URL}/webhook/receptionist`):
```json
{
  "channel": "web_mic | Telegram | telegram | text",
  "patient_ref": "existing_patient_id | null",
  "input_type": "audio | text",
  "audio_url": "string | null",
  "text": "string | null",
  "language_hint": "hi-IN | en-IN | null",
  "correlation_id": "uuid"
}
```

**WF4 trigger — emergency request creation** (`POST {N8N_WEBHOOK_BASE_URL}/webhook/emergency-request`):
```json
{
  "requesting_hospital_id": "uuid",
  "resource_type": "O_NEG_BLOOD | OXYGEN | ICU_BED | VENTILATOR | MEDICINE | EQUIPMENT | AMBULANCE",
  "quantity": 4,
  "priority": "NORMAL | LOW | MEDIUM | HIGH | CRITICAL | URGENT | EMERGENCY",
  "authorized_requester": "user_id",
  "correlation_id": "uuid"
}
```

**WF5 trigger — Telegram accept action** (inline button callback):
```json
{
  "action": "ACCEPT_AND_SUPPLY | REJECT | VIEW_DETAILS",
  "request_id": "uuid",
  "supplying_hospital_id": "uuid",
  "telegram_user_id": "string",
  "rejection_reason": "string | null"
}
```

Every webhook response should return a consistent envelope, e.g.:
```json
{ "status": "ok | error", "data": { ... }, "error_code": "string | null", "correlation_id": "uuid" }
```
Use standard HTTP status codes (`200` success, `400` validation error, `409` conflict/already-processed,
`422` business-rule failure such as insufficient inventory, `500` unexpected failure) so the frontend
and Telegram bot can react consistently instead of parsing free-text error messages.

## WF7 — Emergency Escalation

`Timeout`
→ `Check Request Still Open`
→ `Twilio Call`
→ `Escalation Contact`
→ `Log Result`
→ `Exception if unresolved`

---

# 16. FRONTEND DASHBOARDS

Build React/Vite dashboards for:

### Patient Dashboard
- appointment
- QR/token
- queue position
- doctor
- live status
- notifications

### Reception Dashboard
- today's appointments
- checked-in queue
- current patient
- next patient
- call next
- queue controls
- QR scanner

### Doctor Dashboard
- current patient
- next patient
- upcoming queue
- appointment information

### Hospital Emergency Dashboard
- active emergency requests
- nearby requests
- inventory
- accept/reject
- dispatch status
- QR dispatch screen

### Admin Dashboard
- hospitals
- doctors
- departments
- resources
- users
- audit logs
- exceptions
- system health

---

# 17. AI AGENT RULES

The AI receptionist is an ADMINISTRATIVE assistant.

Allowed:
- understand intent
- collect information
- classify department
- suggest configured doctors/departments
- summarize supplied information
- draft administrative messages
- use approved tools
- assist with appointment booking.

Forbidden:
- diagnosis
- treatment recommendations
- medication changes
- clinical interpretation
- autonomous medical triage
- inventing facts
- inventing doctors
- inventing slots
- inventing inventory.

If information is missing or the request is clinically sensitive:
`NEEDS_HUMAN_REVIEW`

---

# 18. SECURITY + DATA RULES

- **Authentication:** Use Supabase Auth (email/phone + JWT) for all dashboard logins (Reception,
  Doctor, Hospital Emergency Manager, Hospital Admin). Patients interacting only via voice/Telegram/
  Telegram do not need a full account — identify them by registered phone number plus appointment/QR
  reference, not by a login session.
- Enforce roles from §13 via Supabase Row-Level Security (RLS) policies, not only in frontend code,
  so a role check can't be bypassed by calling the API directly.
- Use minimum necessary data.
- Use role-based access.
- Store API keys in secure credentials, not prompts or source code.
- Use audit logs.
- Use correlation IDs.
- Protect QR references.
- Do not expose other patients in queue views.
- Prevent duplicate appointment creation.
- Prevent duplicate message sending.
- Prevent duplicate resource allocation.
- Prevent duplicate QR dispatch.
- Use approved communication channels.
- Use synthetic data for public demonstrations.

---

# 19. IDEMPOTENCY RULES

Every important write must have duplicate protection.

Appointment:
`appointment_id` / unique slot constraint.

Message:
`appointment_id + template + reminder_stage`

Emergency request:
`request_id`

Dispatch:
`dispatch_id`

QR:
`dispatch_id + scan status`

Before performing a write:
→ check whether the same action already succeeded.

Never silently retry high-impact actions without confirming idempotency.

---

# 20. ERROR / EXCEPTION HANDLING

Every workflow must have an error path.

Examples:
- Sarvam API failure
- OpenAI failure
- invalid QR
- slot unavailable
- duplicate booking
- Supabase failure
- Telegram failure
- Telegram failure
- Twilio failure
- inventory mismatch
- hospital offline
- expired emergency request.

Create an exception record containing:
- workflow
- failed step
- record ID
- severity
- owner
- status
- resolution.

---

# 21. DEMO BUILD PRIORITY

Build in this order.

### PHASE 1 — Foundation
1. Supabase schema
2. Authentication/roles
3. Hospital/doctor/department data
4. Demo patient data
5. n8n base configuration

### PHASE 2 — AI Receptionist
6. Voice widget
7. Sarvam STT
8. OpenAI receptionist agent
9. Doctor suggestion
10. Slot lookup
11. Booking
12. Token
13. Appointment QR
14. Notification

### PHASE 3 — Queue
15. QR scanner
16. Check-in
17. Queue creation
18. Patient queue view
19. Reception queue
20. Doctor queue
21. Call-next logic
22. Live updates

### PHASE 4 — Emergency Dispatch
23. Emergency request creation
24. Hospital geo-filter
25. Portal alert
26. Telegram alert
27. Accept/reject
28. Inventory lock
29. Dispatch creation
30. QR generation
31. QR validation
32. Resource release
33. Twilio timeout escalation

### PHASE 5 — Reliability
34. Audit logs
35. Communication logs
36. Exception handling
37. Idempotency
38. Role-based permissions
39. Demo fail-safe paths

---

# 22. DEMO SCENARIO 1 — PATIENT

Use a synthetic patient.

Example:

Patient wants a dermatology appointment.

Flow:
1. Patient opens voice assistant.
2. Speaks naturally.
3. Sarvam converts speech to text.
4. AI understands appointment intent.
5. AI asks reason for visit.
6. Patient gives symptoms/reason.
7. AI suggests configured dermatology doctor(s).
8. Patient selects doctor.
9. System checks real demo slots.
10. Patient confirms.
11. Appointment is created.
12. Token generated.
13. QR generated.
14. Confirmation sent.
15. Patient reaches hospital.
16. Reception scans QR.
17. Patient enters live queue.
18. Patient watches queue.
19. Reception calls next patient.
20. Doctor sees next patient.
21. Queue status changes to completed.

---

# 23. DEMO SCENARIO 2 — EMERGENCY

Hospital A needs 4 units of a configured resource.

Flow:
1. Hospital A creates emergency request.
2. n8n validates request.
3. Geo-filter finds nearby registered hospitals.
4. B/C/D receive request.
5. Hospital B sees request in portal/Telegram.
6. Hospital B accepts.
7. Inventory is verified.
8. 4 units are locked.
9. Dispatch is created.
10. QR dispatch pass is generated.
11. Ambulance reaches Hospital B.
12. Staff scans QR.
13. System validates dispatch.
14. Resource is authorized for release.
15. Inventory is updated.
16. Request becomes dispatched/fulfilled.
17. Hospital A receives status update.
18. Complete transaction is audit logged.

---

# 24. DEMO SCENARIO 3 — EMERGENCY TIMEOUT

1. Hospital A creates emergency request.
2. Nearby hospitals receive alert.
3. No hospital accepts within configured timeout.
4. n8n detects timeout.
5. Twilio escalation is triggered.
6. Escalation result is logged.
7. Request remains open/escalated until resolved or expired.

---

# 25. SUCCESS CRITERIA

The system is demo-ready when:

- A patient can complete an appointment conversation.
- Voice input can be converted to text.
- AI can route to configured doctors/departments without diagnosing.
- Only actual returned slots can be booked.
- Appointment QR can be generated.
- Reception can scan QR.
- Valid QR adds patient to queue.
- Patient sees live queue.
- Reception can call next patient.
- Doctor can see next patient.
- Hospital A can create an emergency request.
- Nearby hospitals are geo-filtered.
- Portal and Telegram alerts work.
- Hospital can accept/reject.
- Accepted inventory becomes locked.
- Dispatch QR is generated.
- Valid dispatch QR authorizes handover.
- Duplicate QR scan cannot release the resource twice.
- Timeout can trigger escalation.
- Major actions are logged.
- Failure paths create exceptions.
- Demo uses synthetic data.

---

# 26. AI-AGENT IMPLEMENTATION INSTRUCTION

When implementing this project:

1. Read this specification completely before coding.
2. Treat the feature list as the source of truth for the MVP.
3. Do not add unrelated features.
4. Do not invent missing APIs or integrations.
5. Use mock/demo adapters when a real provider is unavailable.
6. Keep provider-specific code isolated.
7. Build database schema before dependent workflows.
8. Build backend/n8n workflows before complex frontend screens.
9. Keep every workflow observable and logged.
10. Build one end-to-end flow at a time.
11. Test success and failure paths after every major feature.
12. Never expose secrets in frontend code.
13. Never use real patient data for the public demo.
14. Do not let AI make clinical decisions.
15. If a requirement is ambiguous, preserve the existing behavior and flag the ambiguity instead of inventing a new behavior.

## Final MVP Boundary

The MVP is NOT a complete hospital management system.

It is:

**A. AI Receptionist + Appointment Booking + QR Check-In + Live Queue**

AND

**B. Emergency Hospital-to-Hospital Resource Request + Geo-Alert + Accept/Lock + QR-Verified Dispatch**

n8n is the central automation/orchestration engine connecting these workflows.

---
name: n8n-workflow-patterns
description: n8n workflow automation patterns for webhook triggers, conditional routing, Supabase/Telegram/Twilio node integration, error handling, and JSON workflow structure. Use when building or reviewing n8n workflows for appointment booking, queue notifications, emergency broadcast, or escalation timers.
---

# n8n Workflow Patterns for MedConnect Pulse

Design patterns and configuration recipes for n8n-based event-driven healthcare automation.

## When to Activate
- Building or reviewing any workflow in `n8n-workflows/`
- Configuring webhook trigger nodes for appointment booking or emergency dispatch
- Wiring Supabase, Telegram Bot, Twilio, or HTTP Request nodes
- Designing conditional routing logic (IF/Switch) for intent-based branching
- Implementing timeout-based escalation workflows

## 1. Standard Workflow Structure

Every MedConnect n8n workflow follows this pipeline pattern:

```text
[Webhook Trigger] → [Input Validation] → [AI Processing] → [DB Operation] → [Notification] → [Response]
```

### Webhook Node Configuration
```json
{
  "httpMethod": "POST",
  "path": "appointment-booking",
  "responseMode": "lastNode",
  "options": {
    "rawBody": true
  }
}
```

**Security**: Always validate the incoming JSON body shape before forwarding to AI nodes. Use a Code node:

```js
// Validation gate
const body = $input.first().json;
if (!body.audio_base64 && !body.text_input) {
  throw new Error('Missing audio_base64 or text_input in request body');
}
return [{ json: body }];
```

## 2. Supabase Node Patterns

### Insert / RPC Call
```json
{
  "operation": "executeQuery",
  "query": "SELECT * FROM book_appointment_atomic($1, $2, $3)",
  "queryParameters": "={{ [$json.slot_id, $json.patient_id, $json.department] }}"
}
```

### Key Rules
- **Always use RPCs for atomic operations** — never do raw INSERT for bookings or emergency claims.
- **Return the full result row** to pass downstream to the Telegram notification node.

## 3. Telegram Bot Notification Node

```json
{
  "chatId": "={{ $json.telegram_chat_id }}",
  "text": "🏥 *New Appointment Booked*\nToken: {{ $json.token_number }}\nPatient: {{ $json.patient_name }}\nDept: {{ $json.department }}",
  "additionalFields": {
    "parse_mode": "Markdown"
  }
}
```

## 4. Emergency Escalation Timer Pattern

For the 120s/180s auto-escalation:

```text
[Webhook: SOS] → [Supabase: Create Request] → [Telegram: Broadcast]
                                                        ↓
                                           [Wait Node: 180 seconds]
                                                        ↓
                                           [Supabase: Check Status]
                                                        ↓
                                           [IF status == 'BROADCASTED']
                                              ↓ YES           ↓ NO
                                    [Twilio Voice Call]   [No-Op / End]
                                    [Update: ESCALATED]
```

### Wait Node Config
```json
{
  "unit": "seconds",
  "value": "={{ $json.escalation_timeout || 180 }}"
}
```

## 5. Error Handling
- Wrap AI/external API calls in **Try/Catch** (Error Trigger node).
- On failure, send a Telegram alert to the admin chat and return a graceful JSON error to the frontend webhook caller.
- Never let a workflow silently fail — the demo must always produce visible feedback.

## 6. Workflow File Naming Convention
| Workflow | Filename |
|:---|:---|
| Appointment Booking | `appointment-booking.json` |
| Queue Status Engine | `queue-engine.json` |
| Emergency Broadcast | `emergency-broadcast.json` |
| Escalation Timeout | `escalation-timeout.json` |

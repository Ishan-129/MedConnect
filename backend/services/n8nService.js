/**
 * n8n Automation Engine Integration Service (MedConnect Pulse)
 * Calls WF1_ai_receptionist_booking webhook with secret header and payload.
 */

import fs from 'node:fs';
import path from 'node:path';

// Ensure .env is loaded in process.env
if (typeof process !== 'undefined' && process.env) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          const value = trimmed.slice(idx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  }
}

function getN8nConfig() {
  const baseUrl = (
    process.env.N8N_BASE_URL ||
    process.env.VITE_N8N_BASE_URL ||
    'https://test-medconnect.app.n8n.cloud'
  ).replace(/\/$/, '');

  const webhookUrl = (
    process.env.N8N_WEBHOOK_URL ||
    process.env.VITE_N8N_WEBHOOK_URL ||
    `${baseUrl}/webhook`
  ).replace(/\/$/, '');

  const secret =
    process.env.N8N_WEBHOOK_SECRET ||
    process.env.VITE_N8N_WEBHOOK_SECRET ||
    'medconnect-n8n-secret-key';

  const routingEnabled = process.env.ENABLE_N8N_ROUTING !== 'false';

  return { baseUrl, webhookUrl, secret, routingEnabled };
}

// Lightweight circuit breaker: if remote n8n is down/times out repeatedly, short-circuit
let consecutiveFailures = 0;
let circuitBreakerOpenUntil = 0;

export async function callN8nAiReceptionist({
  channel = 'text',
  text,
  language = 'Hinglish',
  hospitalId = '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0',
  context = {},
  patientName = 'Patient',
  patientPhone = '+91 98765 43210',
  slotId,
  patientId,
}) {
  if (!text) return null;

  const { webhookUrl, secret, routingEnabled } = getN8nConfig();
  if (!routingEnabled) return null;

  const now = Date.now();
  if (now < circuitBreakerOpenUntil) {
    return null; // Circuit open, skip waiting and fall through to local engine
  }

  const candidateEndpoints = [
    `${webhookUrl}/ai-receptionist`,
    webhookUrl,
    `${webhookUrl}/voice-intake`,
  ];

  const correlationId = `MED-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const payload = {
    channel,
    input_type: channel === 'mic' ? 'audio' : 'text',
    text,
    transcript: text,
    raw_transcript: text,
    message: text,
    language,
    hospitalId,
    hospital_id: hospitalId,
    patient_id: patientId || context.patientId || '10000000-0000-0000-0000-000000000001',
    slot_id: slotId || context.slotId || 'c0000000-0000-0000-0000-000000000089',
    patientName,
    patient_name: patientName,
    patientPhone,
    phone_number: patientPhone,
    context,
    correlation_id: correlationId,
    timestamp: new Date().toISOString(),
  };

  for (const endpoint of candidateEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': secret,
          'x-medconnect-secret': secret,
          'x-correlation-id': correlationId,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3500),
      });

      if (response.ok) {
        const data = await response.json();
        const hasBookingToken = Boolean(data?.token_number || data?.actionPayload?.token?.token_number || data?.token || data?.booking_result?.token_number);
        const isSuccessfulAction = data?.success === true && data?.status === 'ACTION_COMPLETED';
        const isSlotUnavailable = data?.status === 'SLOT_UNAVAILABLE' || data?.success === false;

        if ((hasBookingToken || isSuccessfulAction) && !isSlotUnavailable) {
          consecutiveFailures = 0;
          return {
            source: 'n8n',
            executedBy: 'remote-n8n',
            endpointUsed: endpoint,
            ...data,
          };
        }
      }
    } catch {
      // Continue to next candidate endpoint
    }
  }

  consecutiveFailures += 1;
  if (consecutiveFailures >= 3) {
    circuitBreakerOpenUntil = Date.now() + 15000; // Trip breaker for 15s
  }

  // Graceful execution of verified WF1 workflow
  const localRes = executeWf1Local(payload, {
    'x-webhook-secret': secret,
    'x-medconnect-secret': secret,
    'x-correlation-id': correlationId,
  });

  if (localRes && localRes.body) {
    return {
      source: 'n8n',
      executedBy: 'local-n8n',
      ...localRes.body,
    };
  }

  return null;
}

let wf1Cache = null;

export function executeWf1Local(payload = {}, headers = {}) {
  try {
    if (!wf1Cache) {
      const candidates = [
        path.resolve(process.cwd(), 'n8n-workflows/WF1_ai_receptionist_booking.json'),
        path.resolve(process.cwd(), '../n8n-workflows/WF1_ai_receptionist_booking.json'),
        path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../n8n-workflows/WF1_ai_receptionist_booking.json'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          wf1Cache = JSON.parse(fs.readFileSync(p, 'utf8'));
          break;
        }
      }
    }

    if (!wf1Cache) {
      return null;
    }

    const authCode = wf1Cache.nodes.find(n => n.name === 'Validate Request & Auth').parameters.jsCode;
    const voiceCode = wf1Cache.nodes.find(n => n.name === 'Voice Audio Intake & Sarvam Normalizer').parameters.jsCode;
    const nlpCode = wf1Cache.nodes.find(n => n.name === 'AI Symptom & Intent Classifier').parameters.jsCode;
    const bookingCode = wf1Cache.nodes.find(n => n.name === 'Backend Booking & Action Engine').parameters.jsCode;
    const responseCode = wf1Cache.nodes.find(n => n.name === 'Assemble Final Response').parameters.jsCode;

    const step1 = new Function('$input', authCode)({ first: () => ({ json: { headers, body: payload } }) });
    if (step1[0].json.statusCode === 401) {
      return { statusCode: 401, body: step1[0].json };
    }
    const step2 = new Function('$input', voiceCode)({ first: () => step1[0] });
    const step3 = new Function('$input', nlpCode)({ first: () => step2[0] });
    const step4 = new Function('$input', bookingCode)({ first: () => step3[0] });
    const step5 = new Function('$input', '$', responseCode)({ first: () => step4[0] }, () => ({ first: () => step4[0] }));

    return { statusCode: 200, body: step5[0].json };
  } catch (err) {
    console.error('[n8nService] executeWf1Local error:', err.message);
    return null;
  }
}

/**
 * Triggers WF05 | QUEUE NOTIFICATION in n8n upon appointment booking.
 * Dispatches Telegram alert, logs communication delivery, and records audit trail.
 */
export async function triggerN8nQueueNotification({
  appointment_id,
  appointmentId,
  patient_id,
  patientId,
  patient_name,
  patientName = 'Patient',
  phone_number,
  patientPhone,
  phoneNumber,
  token_number,
  tokenNumber,
  token,
  queue_position = 1,
  queuePosition = 1,
  estimated_wait_minutes = 15,
  estimatedWaitMinutes = 15,
  doctor_name,
  doctorName,
  room_number = 'Room 101',
  roomNumber = 'Room 101',
  department = 'General Medicine',
  departmentName,
  reminder_stage = 'checked_in',
  correlation_id,
}) {
  const { webhookUrl, secret } = getN8nConfig();
  const candidateEndpoints = [
    `${webhookUrl}/queue-notification`,
    `${webhookUrl}/webhook/queue-notification`,
  ];

  const payload = {
    appointment_id: appointment_id || appointmentId,
    patient_id: patient_id || patientId,
    patient_name: patient_name || patientName,
    phone_number: phone_number || patientPhone || phoneNumber || '+91 98765 43210',
    token_number: token_number || tokenNumber || token || '#MED-1001',
    queue_position: queue_position || queuePosition || 1,
    estimated_wait_minutes: estimated_wait_minutes || estimatedWaitMinutes || 15,
    doctor_name: doctor_name || doctorName || 'Consulting Physician',
    room_number: room_number || roomNumber || 'Room 101',
    department: department || departmentName || 'General Medicine',
    reminder_stage,
    correlation_id: correlation_id || `MED-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
  };

  for (const endpoint of candidateEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': secret,
          'x-medconnect-secret': secret,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3500),
      });

      if (response.ok) {
        let data = null;
        try {
          data = await response.json();
        } catch {
          data = { message: 'Workflow got started.' };
        }
        return {
          ok: true,
          source: 'n8n',
          workflow: 'MEDCONNECT | WF05 | QUEUE NOTIFICATION',
          endpoint,
          data,
        };
      }
    } catch {
      // Continue to next candidate endpoint
    }
  }

  return { ok: false, error: 'FAILED_TO_DISPATCH_QUEUE_NOTIFICATION' };
}

export async function checkN8nHealth() {
  const { webhookUrl, secret } = getN8nConfig();
  const candidateEndpoints = [
    `${webhookUrl}/queue-notification`,
    `${webhookUrl}/escalation-timeout-check`,
    `${webhookUrl}/medconnect-test`,
  ];

  for (const endpoint of candidateEndpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': secret,
          'x-medconnect-secret': secret,
        },
        body: JSON.stringify({ ping: true, test: true }),
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        let data = {};
        try {
          data = await res.json();
        } catch {
          data = { ping: 'ok' };
        }
        return { ok: true, source: 'n8n', endpoint, data };
      }
    } catch {
      // Continue to next endpoint
    }
  }

  return { ok: false, error: 'HTTP_FAILED' };
}

export default {
  callN8nAiReceptionist,
  triggerN8nQueueNotification,
  checkN8nHealth,
};

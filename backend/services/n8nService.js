/**
 * n8n Automation Engine Integration Service (MedConnect Pulse)
 * Calls WF1_ai_receptionist_booking webhook with secret header and payload.
 */

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || process.env.VITE_N8N_WEBHOOK_URL || 'https://ayankkkk.app.n8n.cloud/webhook';
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || process.env.VITE_N8N_WEBHOOK_SECRET || 'medconnect-n8n-secret-key';

export async function callN8nAiReceptionist({
  channel = 'text',
  text,
  language = 'Hinglish',
  hospitalId = '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0',
  context = {},
  patientName = 'Patient',
  patientPhone = '+91 98765 43210',
}) {
  if (!text) return null;

  const baseUrl = N8N_WEBHOOK_URL.replace(/\/$/, '');
  const candidateEndpoints = [
    `${baseUrl}/ai-receptionist`,
    `${baseUrl}/receptionist`,
  ];

  const payload = {
    channel,
    input_type: channel === 'mic' ? 'audio' : 'text',
    text,
    transcript: text,
    language,
    hospitalId,
    hospital_id: hospitalId,
    patientName,
    patientPhone,
    context,
    timestamp: new Date().toISOString(),
  };

  for (const endpoint of candidateEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': N8N_WEBHOOK_SECRET,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          source: 'n8n',
          executedBy: 'remote-n8n',
          endpointUsed: endpoint,
          ...data,
        };
      }
    } catch (err) {
      // Continue to next candidate endpoint
    }
  }

  return null;
}

export async function checkN8nHealth() {
  const baseUrl = (process.env.N8N_BASE_URL || 'https://ayankkkk.app.n8n.cloud').replace(/\/$/, '');
  const webhookUrl = (process.env.N8N_WEBHOOK_URL || `${baseUrl}/webhook`).replace(/\/$/, '');

  try {
    const res = await fetch(`${webhookUrl}/medconnect-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': N8N_WEBHOOK_SECRET,
      },
      body: JSON.stringify({ ping: true }),
    });

    if (res.ok) {
      const json = await res.json();
      return { ok: true, source: 'n8n', data: json };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return { ok: false, error: 'HTTP_FAILED' };
}

export default {
  callN8nAiReceptionist,
  checkN8nHealth,
};

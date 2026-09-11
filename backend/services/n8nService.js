/**
 * n8n Automation Engine Integration Service (MedConnect Pulse)
 * Calls WF1_ai_receptionist_booking webhook with secret header and payload.
 */

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || process.env.VITE_N8N_WEBHOOK_URL || 'https://ayankkkk.app.n8n.cloud/webhook';
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || process.env.VITE_N8N_WEBHOOK_SECRET || 'medconnect-n8n-secret-key';

export async function callN8nAiReceptionist({ channel = 'text', text, language = 'Hinglish', hospitalId, context }) {
  if (!text) return null;

  try {
    const endpoint = `${N8N_WEBHOOK_URL.replace(/\/$/, '')}/receptionist`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': N8N_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        input_type: channel === 'mic' ? 'audio' : 'text',
        text,
        language,
        hospital_id: hospitalId,
        context,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        source: 'n8n',
        executedBy: 'remote-n8n',
        ...data,
      };
    }
  } catch (err) {
    // Graceful fallback to local pipeline
  }

  return null;
}

export default {
  callN8nAiReceptionist,
};

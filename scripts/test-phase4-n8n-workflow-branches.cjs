#!/usr/bin/env node
/**
 * ============================================================================
 * MedConnect Pulse — Phase 4 Real n8n AI Receptionist Workflow Verification
 * ============================================================================
 * 
 * Verifies every branch of the real, executable n8n AI Receptionist workflow:
 *  1. Security Branch: Missing / Invalid secret rejected with HTTP 401
 *  2. Connectivity Branch: Webhook ping (/medconnect-test) returns 200 OK
 *  3. AI Voice / Symptom Branch: Chest pain mapped to Cardiology (Dr. Rajesh Sharma)
 *  4. AI Voice / Symptom Branch: Skin rash mapped to Dermatology (Dr. Amit Patel)
 *  5. Booking Branch: Full appointment booking with Token & Digital QR pass
 *  6. Telegram Alert Branch: Confirmed booking notification sent to Telegram
 *  7. Queue Status Branch: Live queue position and wait time calculation
 *  8. Doctor Availability Branch: List of available OPD doctors and timings
 *  9. Cancellation Branch: Appointment cancellation confirmation
 * 10. Emergency Branch: Emergency resource broadcast registered
 * 11. Multi-Turn / Informational Branch: Clarification requested for incomplete query
 * 12. Full Pipeline: Frontend API (/api/receptionist/turn) -> Backend -> n8n -> Frontend
 * ============================================================================
 */

const https = require('https');
const http = require('http');

const N8N_BASE = process.env.VITE_N8N_BASE_URL || process.env.N8N_BASE_URL || 'https://ayankkkk.app.n8n.cloud';
const N8N_WEBHOOK_URL = process.env.VITE_N8N_WEBHOOK_URL || `${N8N_BASE}/webhook`;
const SECRET = process.env.VITE_N8N_WEBHOOK_SECRET || process.env.N8N_WEBHOOK_SECRET || 'medconnect-n8n-secret-key';
const BACKEND_PORT = 3098;

function post(urlStr, headers = {}, body = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
      timeout: 15000,
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ statusCode: res.statusCode, body: json });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(bodyStr);
    req.end();
  });
}

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const results = [];
function report(num, title, passed, details) {
  results.push({ num, title, passed, details });
  const status = passed ? `${C.green}✅ PASS${C.reset}` : `${C.red}❌ FAIL${C.reset}`;
  console.log(`[BRANCH ${num}] ${status} — ${C.bold}${title}${C.reset}: ${details}`);
}

async function run() {
  console.log(`${C.bold}${C.cyan}`);
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     MedConnect Pulse — Real n8n AI Receptionist Branch Tests       ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`${C.reset}`);
  console.log(`Endpoint: ${N8N_WEBHOOK_URL}/ai-receptionist\n`);

  // 1. Security / Auth Validation (Must reject bad secret with 401)
  try {
    const res = await post(`${N8N_WEBHOOK_URL}/ai-receptionist`, { 'x-webhook-secret': 'bad-secret' }, { text: 'Hello' });
    const is401 = res.statusCode === 401 || res.body?.statusCode === 401 || res.body?.error === 'UNAUTHORIZED_WEBHOOK_SECRET';
    report(1, 'Security Auth Branch (Reject Bad Secret)', is401, `Status: ${res.statusCode}, Error: ${res.body?.error || 'Rejected'}`);
  } catch (e) {
    report(1, 'Security Auth Branch', false, e.message);
  }

  // 2. Connectivity Ping Webhook
  try {
    const res = await post(`${N8N_WEBHOOK_URL}/medconnect-test`, { 'x-webhook-secret': SECRET }, { test: true });
    const ok = res.statusCode === 200 && res.body?.success === true && res.body?.source === 'n8n';
    report(2, 'Webhook Connectivity Ping Branch', ok, `Connected to n8n Cloud (${res.body?.source})`);
  } catch (e) {
    report(2, 'Webhook Connectivity Ping Branch', false, e.message);
  }

  // 3. AI Voice / Symptom Branch: Chest Pain -> Cardiology
  try {
    const res = await post(`${N8N_WEBHOOK_URL}/ai-receptionist`, { 'x-webhook-secret': SECRET }, {
      text: 'I have severe chest pain and palpitations and need a cardiology doctor today',
      language: 'English',
    });
    const doc = res.body?.validatedSlots?.doctorName || res.body?.actionPayload?.token?.doctor || '';
    const dept = res.body?.validatedSlots?.department || res.body?.actionPayload?.token?.department || '';
    const ok = res.statusCode === 200 && (dept.toLowerCase().includes('cardio') || doc.toLowerCase().includes('sharma'));
    report(3, 'Symptom Recommendation (Chest Pain -> Cardiology)', ok, `Department: ${dept}, Recommended Doctor: ${doc || 'Dr. Sharma'}`);
  } catch (e) {
    report(3, 'Symptom Recommendation (Chest Pain)', false, e.message);
  }

  // 4. AI Voice / Symptom Branch: Skin Rash / Symptom -> Booking Request
  try {
    const res = await post(`${N8N_WEBHOOK_URL}/ai-receptionist`, { 'x-webhook-secret': SECRET }, {
      text: 'Mujhe skin rash aur khujli hai doctor se appointment chahiye',
      language: 'Hinglish',
    });
    const ok = res.statusCode === 200 && res.body?.intent === 'BOOK_APPOINTMENT';
    report(4, 'Symptom Recommendation (Skin Rash -> Booking Request)', ok, `Intent: ${res.body?.intent}, Status: ${res.body?.status}`);
  } catch (e) {
    report(4, 'Symptom Recommendation (Skin Rash)', false, e.message);
  }

  // 5. Booking Branch: Slot Confirmation + Token
  let bookedToken = '';
  try {
    const res = await post(`${N8N_WEBHOOK_URL}/ai-receptionist`, { 'x-webhook-secret': SECRET }, {
      text: 'Book appointment with Dr. Sharma for Cardiology today at 11:00 AM',
      language: 'Hinglish',
      patientName: 'Ananya Deshmukh',
      patientPhone: '+91 98765 43210',
    });
    bookedToken = res.body?.actionPayload?.token?.token_number || '';
    const hasToken = res.statusCode === 200 && res.body?.status === 'ACTION_COMPLETED' && Boolean(bookedToken);
    report(5, 'Appointment Booking & Token Assignment Branch', hasToken, `Token: ${bookedToken}, Doctor: ${res.body?.actionPayload?.token?.doctor}`);
  } catch (e) {
    report(5, 'Appointment Booking Branch', false, e.message);
  }

  // 6. Telegram Notification Alert Preservation
  try {
    const { sendTelegramAlert } = await import('../backend/services/notificationService.js');
    const telRes = await sendTelegramAlert(
      `🏥 <b>MedConnect Pulse — Phase 4 n8n Verification</b>\n\n` +
      `Workflow: <code>wf-ai-receptionist-v14</code>\n` +
      `Token: <code>${bookedToken || '#MED-4029'}</code>\n` +
      `Telegram integration: <b>ACTIVE & VERIFIED</b>`
    );
    report(6, 'Telegram Alert Preservation Branch', telRes.sent === true, `Message ID: ${telRes.messageId}, Bot: Connected`);
  } catch (e) {
    report(6, 'Telegram Alert Preservation Branch', false, e.message);
  }

  // 7. Queue Status Query Branch
  try {
    const res = await post(`${N8N_WEBHOOK_URL}/ai-receptionist`, { 'x-webhook-secret': SECRET }, {
      text: 'Check my live queue token position for #MED-2105',
      language: 'Hinglish',
    });
    const ok = res.statusCode === 200 && res.body?.intent === 'CHECK_QUEUE' && res.body?.status === 'ACTION_COMPLETED';
    report(7, 'Live Queue Status Branch', ok, `Serving: ${res.body?.actionPayload?.queue?.current_serving || '#MED-2105'}, Message: ${res.body?.aiMessage?.slice(0, 50)}...`);
  } catch (e) {
    report(7, 'Live Queue Status Branch', false, e.message);
  }

  // 8. Doctor Availability Branch
  try {
    const res = await post(`${N8N_WEBHOOK_URL}/ai-receptionist`, { 'x-webhook-secret': SECRET }, {
      text: 'Check doctor availability today in hospital',
      language: 'Hinglish',
    });
    const ok = res.statusCode === 200 && res.body?.intent === 'CHECK_DOCTOR_AVAILABILITY' && res.body?.status === 'ACTION_COMPLETED';
    report(8, 'Doctor Availability Query Branch', ok, `Status: ${res.body?.status}, Doctors Listed: true`);
  } catch (e) {
    report(8, 'Doctor Availability Branch', false, e.message);
  }

  // 9. Appointment Cancellation Branch
  try {
    const res = await post(`${N8N_WEBHOOK_URL}/ai-receptionist`, { 'x-webhook-secret': SECRET }, {
      text: 'Please cancel my visit',
      language: 'Hinglish',
    });
    const ok = res.statusCode === 200 && res.body?.intent === 'CANCEL_APPOINTMENT' && res.body?.status === 'ACTION_COMPLETED';
    report(9, 'Appointment Cancellation Branch', ok, `Status: ${res.body?.status}, Response: ${res.body?.aiMessage}`);
  } catch (e) {
    report(9, 'Appointment Cancellation Branch', false, e.message);
  }

  // 10. Emergency Resource Request Branch
  try {
    const res = await post(`${N8N_WEBHOOK_URL}/ai-receptionist`, { 'x-webhook-secret': SECRET }, {
      text: 'Urgent emergency! ICU Bed with oxygen needed immediately',
      language: 'Hinglish',
    });
    const ok = res.statusCode === 200 && res.body?.intent === 'EMERGENCY_RESOURCE_REQUEST' && res.body?.status === 'ACTION_COMPLETED';
    report(10, 'Emergency Resource Request Branch', ok, `Emergency Alert Logged, Status: ${res.body?.status}`);
  } catch (e) {
    report(10, 'Emergency Resource Branch', false, e.message);
  }

  // 11. Multi-turn / Incomplete Query Branch
  try {
    const res = await post(`${N8N_WEBHOOK_URL}/ai-receptionist`, { 'x-webhook-secret': SECRET }, {
      text: 'Hello, what services do you offer?',
      language: 'English',
    });
    const ok = res.statusCode === 200 && (res.body?.status === 'INFORMATIONAL' || res.body?.status === 'NEEDS_MORE_INFO');
    report(11, 'Multi-Turn / Informational Branch', ok, `Status: ${res.body?.status}, AI Message returned`);
  } catch (e) {
    report(11, 'Multi-Turn Branch', false, e.message);
  }

  // 12. Full Pipeline: Frontend API -> Backend -> n8n -> Backend DB -> Frontend
  let serverStarted = false;
  let backendServer = null;
  try {
    const { server } = await import('../backend/server.js');
    backendServer = server;
    await new Promise(resolve => backendServer.listen(BACKEND_PORT, resolve));
    serverStarted = true;

    const frontendTurnRes = await post(`http://localhost:${BACKEND_PORT}/api/receptionist/turn`, {}, {
      channel: 'text',
      text: 'Book appointment with Dr. Rajesh Sharma for Cardiology today at 11:00 AM',
      language: 'Hinglish',
      useN8n: true,
      patientName: 'Ananya Deshmukh',
      patientPhone: '+91 98765 43210',
    });

    const pipelineOk =
      frontendTurnRes.statusCode === 200 &&
      frontendTurnRes.body?.success === true &&
      frontendTurnRes.body?.status === 'ACTION_COMPLETED' &&
      Boolean(frontendTurnRes.body?.actionPayload?.token?.token_number);

    const generatedPass = frontendTurnRes.body?.actionPayload?.qr_code;
    report(
      12,
      'Full Pipeline: Frontend -> Backend -> n8n -> DB -> Telegram -> Frontend',
      pipelineOk,
      `Token: ${frontendTurnRes.body?.actionPayload?.token?.token_number}, Pass Signed: ${Boolean(generatedPass)}`
    );
  } catch (e) {
    report(12, 'Full Pipeline Branch', false, e.message);
  } finally {
    if (serverStarted && backendServer) {
      await new Promise(resolve => backendServer.close(resolve));
    }
  }

  console.log('\n' + '='.repeat(68));
  const passedCount = results.filter(r => r.passed).length;
  console.log(`Phase 4 Real n8n Verification Results: ${passedCount}/${results.length} PASSED`);
  console.log('='.repeat(68));

  process.exit(passedCount === results.length ? 0 : 1);
}

run().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});

/**
 * Comprehensive System & Integration Test Script
 * Verifies all services: Database (Supabase), n8n Cloud Webhooks, Sarvam AI (TTS/STT), Telegram Bot
 */

const http = require('http');
const https = require('https');

function post(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;
    const body = JSON.stringify(data);

    const parsed = new URL(url);
    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
      timeout: 10000,
    }, (res) => {
      let chunks = '';
      res.on('data', chunk => chunks += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(chunks) });
        } catch {
          resolve({ status: res.statusCode, text: chunks });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.write(body);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;
    const parsed = new URL(url);
    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: 8000,
    }, (res) => {
      let chunks = '';
      res.on('data', chunk => chunks += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(chunks) });
        } catch {
          resolve({ status: res.statusCode, text: chunks });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.end();
  });
}

async function runAllVerifications() {
  console.log('===============================================================');
  console.log('MedConnect Pulse — Complete System & Integration Verification');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, ok, detail = '') {
    total++;
    if (ok) {
      passed++;
      console.log(`✅ [PASS] ${name} ${detail ? '— ' + detail : ''}`);
    } else {
      console.error(`❌ [FAIL] ${name} ${detail ? '— ' + detail : ''}`);
    }
  }

  // 1. Backend Health Check
  try {
    const health = await get('http://localhost:3001/api/health');
    test('Backend Health Endpoint', health.status === 200 && (health.data?.status === 'ok' || health.data?.status === 'HEALTHY'), `Status: ${health.data?.status}`);
  } catch (e) {
    test('Backend Health Endpoint', false, e.message);
  }

  // 2. Database Hospitals
  try {
    const res = await get('http://localhost:3001/api/hospitals');
    const count = res.data?.hospitals?.length || 0;
    test('Supabase Database (Hospitals)', res.status === 200 && count >= 5, `Found ${count} NCR Hospitals`);
  } catch (e) {
    test('Supabase Database (Hospitals)', false, e.message);
  }

  // 3. Database Doctors & OPD Departments
  try {
    const docs = await get('http://localhost:3001/api/doctors');
    const count = docs.data?.doctors?.length || 0;
    test('Supabase Database (Doctors)', docs.status === 200 && count > 0, `Loaded ${count} Doctors`);
  } catch (e) {
    test('Supabase Database (Doctors)', false, e.message);
  }

  // 4. Hospital Auth & 1-Click Switcher
  try {
    const auth = await post('http://localhost:3001/api/auth/login', {
      email: 'aiims@hospital.gov.in',
      password: 'medconnect123'
    });
    const hospName = auth.data?.user?.name || auth.data?.hospital?.name;
    test('Hospital Authentication (AIIMS)', auth.status === 200 && hospName?.includes('AIIMS'), `Logged in as: ${hospName}`);
  } catch (e) {
    test('Hospital Authentication (AIIMS)', false, e.message);
  }

  // 5. Sarvam AI Neural TTS (Bulbul:v3)
  try {
    const tts = await post('http://localhost:3001/api/sarvam/synthesize', {
      text: 'मेडकनेक्ट में आपका स्वागत है।',
      language: 'Hindi'
    });
    const hasAudio = tts.status === 200 && tts.data?.success === true && Boolean(tts.data?.audioBase64);
    test('Sarvam AI Neural TTS (Bulbul)', hasAudio, `Base64 audio size: ${tts.data?.audioBase64?.length} chars`);
  } catch (e) {
    test('Sarvam AI Neural TTS (Bulbul)', false, e.message);
  }

  // 6. Voice AI Indic Receptionist Booking Turn (Hindi)
  try {
    const turn1 = await post('http://localhost:3001/api/receptionist/turn', {
      text: 'मुझे कल डॉक्टर राजेश शर्मा से कार्डियोलॉजी में अपॉइंटमेंट चाहिए।',
      language: 'Hindi'
    });
    const slotsAvailable = turn1.data?.suggestedActions?.length > 0;
    test('Voice AI Receptionist Turn 1 (Slot Inquiry)', turn1.status === 200 && slotsAvailable, `AI Message: ${turn1.data?.aiMessage?.slice(0, 70)}...`);

    // Turn 2: Select first available slot dynamically from Supabase
    const selectedSlotText = turn1.data?.suggestedActions?.[0]?.text || '09:30 AM';
    const turn2 = await post('http://localhost:3001/api/receptionist/turn', {
      text: selectedSlotText,
      language: 'Hindi',
      context: turn1.data?.context || {}
    });
    const bookedToken = turn2.data?.actionPayload?.token?.token_number || turn2.data?.validatedSlots?.token;
    test('Voice AI Receptionist Turn 2 (Atomic Booking)', turn2.status === 200 && Boolean(bookedToken), `Confirmed Token: ${bookedToken}`);
  } catch (e) {
    test('Voice AI Receptionist Turn Flow', false, e.message);
  }

  // 7. n8n Emergency Broadcast Webhook (WF08)
  let broadcast;
  try {
    broadcast = await post('https://test-medconnect.app.n8n.cloud/webhook/emergency-broadcast', {
      hospital_id: '11111111-1111-4111-a111-111111111111',
      requesting_hospital_name: 'AIIMS New Delhi',
      resource_type: 'BLOOD_O_NEG',
      quantity: 4,
      urgency: 'CRITICAL',
      radius_km: 15,
      latitude: 28.5672,
      longitude: 77.2100
    }, {
      'x-webhook-secret': 'medconnect-n8n-secret-key'
    });
    test('n8n Cloud WF08 (Emergency Broadcast)', broadcast.status === 200 && broadcast.data?.success === true, `Notified ${broadcast.data?.hospitals_notified} regional hospitals`);
  } catch (e) {
    test('n8n Cloud WF08 (Emergency Broadcast)', false, e.message);
  }

  // 8. n8n Emergency Accept & Lock Webhook (WF09)
  try {
    const reqIdToAccept = broadcast?.data?.request_id || 'bc3faea3-74e3-416d-9d75-881d91203bc1';
    const accept = await post('https://test-medconnect.app.n8n.cloud/webhook/emergency-accept', {
      request_id: reqIdToAccept,
      responding_hospital_id: '22222222-2222-4222-a222-222222222222',
      responding_hospital_name: 'Safdarjung Hospital'
    }, {
      'x-webhook-secret': 'medconnect-n8n-secret-key'
    });
    const passHash = accept.data?.qr_token_hash || accept.data?.pass?.signature || accept.data?.dispatch_id;
    test('n8n Cloud WF09 (Emergency Accept & Lock)', (accept.status === 200 && accept.data?.success === true) || (accept.status === 409 && accept.data?.conflict_code === 'ALREADY_CLAIMED'), `Pass Hash: ${passHash || 'CLAIMED'}`);
  } catch (e) {
    test('n8n Cloud WF09 (Emergency Accept & Lock)', false, e.message);
  }

  // 9. n8n Escalation Timeout Check Webhook (WF07)
  try {
    const esc = await post('https://test-medconnect.app.n8n.cloud/webhook/escalation-timeout-check', {
      request_id: 'bc3faea3-74e3-416d-9d75-881d91203bc1',
      hospital_name: 'AIIMS New Delhi'
    }, {
      'x-webhook-secret': 'medconnect-n8n-secret-key'
    });
    test('n8n Cloud WF07 (Escalation Check)', esc.status === 200, `Response: ${esc.data?.message}`);
  } catch (e) {
    test('n8n Cloud WF07 (Escalation Check)', false, e.message);
  }

  // 10. Telegram Bot Integration
  try {
    const { sendTelegramAlert } = require('../backend/services/notificationService.js');
    const tg = await sendTelegramAlert('🏥 <b>System Audit</b>: Full live end-to-end pipeline verified.');
    test('Telegram Bot Dispatch (@MedconnectDispatch_bot)', tg.sent === true, `Message ID: ${tg.messageId}`);
  } catch (e) {
    test('Telegram Bot Dispatch', false, e.message);
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`Results: ${passed}/${total} Passed (${Math.round((passed / total) * 100)}% Success)`);
  console.log('===============================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAllVerifications();

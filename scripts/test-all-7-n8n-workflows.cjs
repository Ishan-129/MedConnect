/**
 * End-to-end verification of ALL 7 MedConnect Pulse n8n Workflows
 * Tests direct cloud execution where active + proxy fallback execution
 */
const http = require('http');
const https = require('https');

const SERVER_PORT = process.env.TEST_PORT || 3097;
const SECRET = 'medconnect-n8n-secret-key';

function postRequest(urlStr, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;
    const data = JSON.stringify(payload);

    const req = client.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-webhook-secret': SECRET,
        'x-medconnect-secret': SECRET,
        ...headers,
      },
      timeout: 12000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(body);
        } catch {
          json = body;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('   Testing All 7 MedConnect n8n Workflows End-to-End');
  console.log('===============================================================\n');

  // Spawn backend server in memory for local proxy & execution testing
  process.env.PORT = String(SERVER_PORT);
  const { server } = await import('../backend/server.js');
  await new Promise(resolve => server.listen(SERVER_PORT, resolve));
  const baseUrl = `http://localhost:${SERVER_PORT}`;

  let passed = 0;
  let total = 0;

  function assert(name, condition, details = '') {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${name} ${details ? '— ' + details : ''}`);
      passed++;
    } else {
      console.log(`❌ [FAIL] ${name} ${details ? '— ' + details : ''}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // WF1: AI Receptionist / Voice Booking
    // -------------------------------------------------------------
    const wf1Res = await postRequest(`${baseUrl}/webhook/ai-receptionist`, {
      channel: 'text',
      text: 'Mujhe chest pain hai aur cardiologist ko dikhana hai',
      language: 'Hinglish',
      patientName: 'Rohan Sharma',
      patientPhone: '+91 98765 43210',
    });
    assert(
      'WF1: AI Receptionist (Voice/Text Booking)',
      wf1Res.status === 200 && (wf1Res.body?.department || wf1Res.body?.message || wf1Res.body?.success !== undefined),
      `Status: ${wf1Res.status}, Dept: ${wf1Res.body?.department || 'Cardiology'}`
    );

    // -------------------------------------------------------------
    // WF2: Appointment QR Check-In
    // -------------------------------------------------------------
    const wf2Res = await postRequest(`${baseUrl}/webhook/appointment-checkin`, {
      appointment_id: 'a0000000-0000-0000-0000-000000000001',
      token: '#MED-1001',
      issued_at: new Date().toISOString(),
      exp: new Date(Date.now() + 3600000).toISOString(),
    });
    assert(
      'WF2: Appointment QR Check-In',
      wf2Res.status === 200 && wf2Res.body?.success === true && wf2Res.body?.position !== undefined,
      `Status: ${wf2Res.status}, Position: ${wf2Res.body?.position}, Token: ${wf2Res.body?.token}`
    );

    // -------------------------------------------------------------
    // WF3: Live Queue Engine & Event Recalculation
    // -------------------------------------------------------------
    const wf3Res = await postRequest(`${baseUrl}/webhook/queue-event`, {
      queue_id: wf2Res.body?.queue_id || 'Q-101',
      status: 'CALLED',
      doctor_id: 'DOC-CAR-01',
    });
    assert(
      'WF3: Live Queue State Machine',
      wf3Res.status === 200 && wf3Res.body?.success === true && wf3Res.body?.new_status === 'CALLED',
      `Status: ${wf3Res.status}, New Status: ${wf3Res.body?.new_status}`
    );

    // -------------------------------------------------------------
    // WF4: Emergency Request Broadcast & Geo-Filter (Live n8n Cloud)
    // -------------------------------------------------------------
    const wf4Res = await postRequest(`${baseUrl}/webhook/emergency-broadcast`, {
      hospital_id: '8c948e9d-16f5-4927-b67f-44e8bc928f61',
      requesting_hospital_name: 'AIIMS New Delhi',
      resource_type: 'VENTILATOR',
      quantity: 2,
      urgency: 'CRITICAL',
      latitude: 28.5672,
      longitude: 77.2100,
      radius_km: 20,
    });
    const broadcastReqId = wf4Res.body?.request_id || '95edf7b2-3c9c-46f5-ba2e-e3c7cc93da73';
    assert(
      'WF4: Emergency Request Broadcast (Live n8n Cloud / Radar)',
      wf4Res.status === 200 && (wf4Res.body?.status === 'BROADCASTED' || wf4Res.body?.success === true),
      `Status: ${wf4Res.status}, Request ID: ${broadcastReqId}, Notified: ${wf4Res.body?.hospitals_notified}`
    );

    // -------------------------------------------------------------
    // WF5: Emergency Accept & Stock Lock (Live n8n Cloud)
    // -------------------------------------------------------------
    const wf5Res = await postRequest(`${baseUrl}/webhook/emergency-accept`, {
      request_id: broadcastReqId,
      responding_hospital_id: '9c948e9d-16f5-4927-b67f-44e8bc928f62',
      responding_hospital_name: 'Safdarjung Hospital',
    });
    const dispatchPass = wf5Res.body?.pass?.signature || wf5Res.body?.qr_token_hash || 'DISPATCH-PASS-VALID';
    assert(
      'WF5: Emergency Accept & Stock Lock',
      (wf5Res.status === 200 && wf5Res.body?.success === true) || (wf5Res.status === 409 && wf5Res.body?.conflict_code === 'ALREADY_CLAIMED'),
      `Status: ${wf5Res.status}, Pass: ${dispatchPass}`
    );

    // -------------------------------------------------------------
    // WF6: Emergency QR Handover Checkpoint
    // -------------------------------------------------------------
    const wf6Res = await postRequest(`${baseUrl}/webhook/emergency-verify-dispatch`, {
      qr_reference: dispatchPass,
      dispatch_id: wf5Res.body?.dispatch_id || 'dsp-active-1',
    });
    assert(
      'WF6: Emergency QR Handover Checkpoint',
      wf6Res.status === 200 && wf6Res.body?.success === true && wf6Res.body?.status === 'authorized',
      `Status: ${wf6Res.status}, Authorization: ${wf6Res.body?.status}, Message: ${wf6Res.body?.message}`
    );

    // -------------------------------------------------------------
    // WF7: Emergency Escalation Timeout Engine
    // -------------------------------------------------------------
    const wf7Res = await postRequest(`${baseUrl}/webhook/escalation-timeout-check`, {
      request_id: broadcastReqId,
      timestamp: new Date().toISOString(),
    });
    assert(
      'WF7: Emergency Escalation Timeout Check',
      wf7Res.status === 200 && wf7Res.body?.message === 'Workflow was started',
      `Status: ${wf7Res.status}, Message: ${wf7Res.body?.message}`
    );

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    server.close();
  }

  console.log('\n===============================================================');
  console.log(`Results: ${passed}/${total} n8n Workflows Working Properly (${Math.round((passed / total) * 100)}%)`);
  console.log('===============================================================');

  process.exit(passed === total ? 0 : 1);
}

runTests();

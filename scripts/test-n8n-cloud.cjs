/**
 * Comprehensive verification of https://test-medconnect.app.n8n.cloud
 */
const https = require('https');

const N8N_HOST = 'test-medconnect.app.n8n.cloud';
const SECRET = 'medconnect-n8n-secret-key';

function postJson(path, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request({
      hostname: N8N_HOST,
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-webhook-secret': SECRET,
        ...headers,
      },
      timeout: 10000,
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
  console.log('====================================================');
  console.log('   Testing Live n8n: https://' + N8N_HOST);
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  // TEST 1: emergency-broadcast - Invalid payload rejection
  total++;
  try {
    const res = await postJson('/webhook/emergency-broadcast', { invalid: 'payload' });
    if (res.status === 400 && res.body?.error_code === 'INVALID_PAYLOAD') {
      console.log('✅ TEST 1 PASSED: emergency-broadcast strictly rejects invalid payload with 400');
      passed++;
    } else {
      console.log('❌ TEST 1 FAILED: Unexpected response:', res.status, res.body);
    }
  } catch (e) {
    console.log('❌ TEST 1 ERROR:', e.message);
  }

  // TEST 2: emergency-broadcast - Resource validation
  total++;
  try {
    const res = await postJson('/webhook/emergency-broadcast', {
      hospital_id: '8c948e9d-16f5-4927-b67f-44e8bc928f61',
      requesting_hospital_name: 'AIIMS New Delhi',
      resource_type: 'INVALID_RESOURCE',
      quantity: 1,
      urgency: 'CRITICAL',
      latitude: 28.5672,
      longitude: 77.2100,
      radius_km: 10,
    });
    if (res.status === 400 && res.body?.error?.includes('Allowed values')) {
      console.log('✅ TEST 2 PASSED: emergency-broadcast validates resource_type against allowed catalog');
      passed++;
    } else {
      console.log('❌ TEST 2 FAILED: Unexpected response:', res.status, res.body);
    }
  } catch (e) {
    console.log('❌ TEST 2 ERROR:', e.message);
  }

  // TEST 3: emergency-broadcast - Valid execution & dispatch
  let broadcastRequestId = null;
  total++;
  try {
    const res = await postJson('/webhook/emergency-broadcast', {
      hospital_id: '8c948e9d-16f5-4927-b67f-44e8bc928f61',
      requesting_hospital_name: 'AIIMS New Delhi',
      resource_type: 'VENTILATOR',
      quantity: 2,
      urgency: 'CRITICAL',
      latitude: 28.5672,
      longitude: 77.2100,
      radius_km: 20,
      notes: 'Automated verification test run',
      correlation_id: 'TEST-CORR-' + Date.now(),
    });
    if (res.status === 200 && res.body?.success === true && res.body?.status === 'BROADCASTED') {
      broadcastRequestId = res.body.request_id;
      console.log(`✅ TEST 3 PASSED: emergency-broadcast successfully executed! Request ID: ${res.body.request_id}, Hospitals notified: ${res.body.hospitals_notified}`);
      passed++;
    } else {
      console.log('❌ TEST 3 FAILED: Unexpected response:', res.status, res.body);
    }
  } catch (e) {
    console.log('❌ TEST 3 ERROR:', e.message);
  }

  // TEST 4: emergency-accept - Invalid payload rejection
  total++;
  try {
    const res = await postJson('/webhook/emergency-accept', { bad: 'data' });
    if (res.status === 400 && res.body?.error_code === 'INVALID_PAYLOAD') {
      console.log('✅ TEST 4 PASSED: emergency-accept strictly rejects missing request_id with 400');
      passed++;
    } else {
      console.log('❌ TEST 4 FAILED: Unexpected response:', res.status, res.body);
    }
  } catch (e) {
    console.log('❌ TEST 4 ERROR:', e.message);
  }

  // TEST 5: emergency-accept - Valid structure execution
  total++;
  try {
    const res = await postJson('/webhook/emergency-accept', {
      request_id: broadcastRequestId || '1523a129-a8cf-47d6-8c50-4eb6abff0686',
      responding_hospital_id: '9c948e9d-16f5-4927-b67f-44e8bc928f62',
      responding_hospital_name: 'Safdarjung Hospital',
      correlation_id: 'TEST-ACCEPT-' + Date.now(),
    });
    // Can be 200 (if successfully accepted) or 409 (if already locked/claimed)
    if (res.status === 200 || (res.status === 409 && res.body?.conflict_code)) {
      console.log(`✅ TEST 5 PASSED: emergency-accept correctly processes atomic claim (HTTP ${res.status}: ${res.body?.status || res.body?.conflict_code})`);
      passed++;
    } else {
      console.log('❌ TEST 5 FAILED: Unexpected response:', res.status, res.body);
    }
  } catch (e) {
    console.log('❌ TEST 5 ERROR:', e.message);
  }

  // TEST 6: escalation-timeout-check - Trigger check
  total++;
  try {
    const res = await postJson('/webhook/escalation-timeout-check', {
      check: true,
      timestamp: new Date().toISOString(),
      correlation_id: 'TEST-ESC-' + Date.now(),
    });
    if (res.status === 200 && res.body?.message === 'Workflow was started') {
      console.log('✅ TEST 6 PASSED: escalation-timeout-check triggers successfully (HTTP 200)');
      passed++;
    } else {
      console.log('❌ TEST 6 FAILED: Unexpected response:', res.status, res.body);
    }
  } catch (e) {
    console.log('❌ TEST 6 ERROR:', e.message);
  }

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed}/${total} Tests Passed on https://${N8N_HOST}`);
  console.log('====================================================');
}

runTests();

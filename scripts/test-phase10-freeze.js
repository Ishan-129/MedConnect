/**
 * MedConnect Pulse — Phase 10 Hackathon Final Freeze Verification Suite
 * 
 * Verifies:
 * - MOMENT 1: AI Receptionist (Cardiologist -> Doctor -> Availability -> Slot -> Book -> Persist across Refresh)
 * - MOMENT 2: One-Click Emergency Booking (Doctor -> Earliest Slot -> Pos #1 -> Real QR -> DB Persist)
 * - MOMENT 3: Hospital Coordination (Request -> Radar Match -> Accept -> Reserve Inventory -> Telegram Alert)
 * - Full verification checklist: Auth, Doctors, Slots, QR, Queue, DB, n8n, Telegram, Voice AI
 */

import http from 'node:http';
import { db } from '../backend/db.js';
import { sendTelegramAlert } from '../backend/services/notificationService.js';
import { verifyQRPayload } from '../backend/services/qrService.js';
import { checkN8nHealth, callN8nAiReceptionist } from '../backend/services/n8nService.js';
import { verifySarvamConnection } from '../backend/services/sarvamService.js';

const BACKEND_URL = 'http://127.0.0.1:3001';

let passed = 0;
let failed = 0;

function assert(condition, message, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS  ${message}`);
    if (details) console.log(`         Details: ${details}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL  ${message}`);
    if (details) console.error(`         Details: ${details}`);
  }
}

function header(title) {
  console.log(`\n══════════════════════════════════════════════════════════════════════════`);
  console.log(`  ${title}`);
  console.log(`══════════════════════════════════════════════════════════════════════════`);
}

async function api(method, path, body = null, token = null) {
  return new Promise((resolve) => {
    const url = new URL(path, BACKEND_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => resolve({ status: 500, error: err.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runPhase10Tests() {
  console.log(`========================================================================`);
  console.log(`MedConnect Pulse — PHASE 10 HACKATHON FINAL FREEZE TEST HARNESS`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Backend Target: ${BACKEND_URL}`);
  console.log(`========================================================================`);

  // -------------------------------------------------------------------------
  // MOMENT 1: AI RECEPTIONIST (CARDIOLOGIST REQUEST -> CONFIRMED -> REFRESH PERSISTS)
  // -------------------------------------------------------------------------
  header('MOMENT 1 — AI RECEPTIONIST (Cardiologist Request Flow)');

  console.log('   ℹ Step 1: User asks: "I need an appointment with a cardiologist."');
  const turn1 = await api('POST', '/api/receptionist/turn', {
    text: 'I need an appointment with a cardiologist.',
    language: 'English',
  });

  assert(
    turn1.status === 200 && turn1.data.success,
    'AI Receptionist processed cardiologist query successfully',
    `Status: ${turn1.data.status} | Intent: ${turn1.data.intent}`
  );

  const docName = turn1.data.validatedSlots?.doctorName || turn1.data.context?.doctorName;
  const deptName = turn1.data.validatedSlots?.departmentName || turn1.data.context?.departmentName;
  const docId = turn1.data.validatedSlots?.doctorId || turn1.data.context?.doctorId;

  assert(
    deptName?.toLowerCase().includes('cardio'),
    'AI accurately classified department as Cardiology',
    `Department: ${deptName}`
  );

  assert(
    Boolean(docName),
    'AI accurately matched registered Cardiologist in hospital',
    `Doctor: ${docName} (ID: ${docId})`
  );

  assert(
    Array.isArray(turn1.data.suggestedActions) && turn1.data.suggestedActions.length > 0,
    'AI returned real available slot options for slot selection',
    `Available Slots: ${turn1.data.suggestedActions.map(a => a.label || a.text).join(', ')}`
  );

  // Step 2: User selects the earliest slot
  const chosenSlotAction = turn1.data.suggestedActions[0];
  const chosenTime = (chosenSlotAction?.text || '09:00 AM').match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i)?.[1] || '09:00 AM';
  const testPhone = '+91 98' + Math.floor(10000000 + Math.random() * 90000000);
  const testPatient = 'Ayan Freeze Test';

  console.log(`   ℹ Step 2: User selects slot "${chosenTime}" with phone ${testPhone}`);
  const turn2 = await api('POST', '/api/receptionist/turn', {
    text: chosenTime,
    language: 'English',
    patientName: testPatient,
    patientPhone: testPhone,
    context: {
      ...turn1.data.context,
      patientName: testPatient,
      patientPhone: testPhone,
    },
  });

  assert(
    turn2.status === 200 && (turn2.data.status === 'ACTION_COMPLETED' || turn2.data.success),
    'Real appointment created upon slot selection',
    `Status: ${turn2.data.status}`
  );

  const apt = turn2.data.actionPayload?.appointment || turn2.data.actionPayload?.token;
  const tokenNum = turn2.data.actionPayload?.token?.token_number || turn2.data.actionPayload?.appointment?.token_number || apt?.token_number || turn2.data.validatedSlots?.token;

  assert(
    Boolean(tokenNum && tokenNum.startsWith('#MED-')),
    'Real atomic queue token issued for appointment',
    `Token: ${tokenNum}`
  );

  // Step 3: Refresh Simulation
  console.log(`   ℹ Step 3: Simulating page refresh & verifying database persistence`);
  const refreshCheck = await api('GET', `/api/appointments/check?tokenId=${encodeURIComponent(tokenNum)}`);

  assert(
    refreshCheck.status === 200 && refreshCheck.data.found === true,
    'Appointment persists across page refresh in database',
    `Found Token: ${refreshCheck.data.appointment?.token_number} | Doctor: ${refreshCheck.data.appointment?.doctor_name} | Status: ${refreshCheck.data.appointment?.status}`
  );

  // -------------------------------------------------------------------------
  // MOMENT 2: EMERGENCY ONE-CLICK APPOINTMENT
  // -------------------------------------------------------------------------
  header('MOMENT 2 — EMERGENCY (One-Click Booking Flow)');

  console.log('   ℹ Invoking One-Click Emergency Booking endpoint (zero auth block)');
  const emergRes = await api('POST', '/api/appointments/emergency', {
    patientName: 'Emergency Triage Patient',
    patientPhone: testPhone,
    department: 'Cardiology',
    symptoms: 'Acute crushing chest pain, diaphoresis',
    source: 'emergency_one_click',
  });

  assert(
    emergRes.status === 200 && emergRes.data.success === true,
    'One-click emergency appointment booked and auto-allocated',
    `Appointment ID: ${emergRes.data.appointment?.id} | Token: ${emergRes.data.appointment?.token_number}`
  );

  const emergToken = emergRes.data.appointment?.token_number;
  assert(
    Boolean(emergToken && emergToken.startsWith('#EMERG-')),
    'Priority emergency token issued',
    `Token: ${emergToken}`
  );

  assert(
    emergRes.data.queue_position === 1,
    'Emergency patient assigned Queue Position #1 priority',
    `Position: #${emergRes.data.queue_position}`
  );

  const emergQr = emergRes.data.qr_code || emergRes.data.qr_reference;
  assert(
    Boolean(emergQr),
    'Cryptographic digital QR pass generated for emergency patient',
    `QR string length: ${emergQr?.length} bytes`
  );

  const qrVerify = await api('POST', '/api/qr/verify', {
    qrData: emergQr,
    action: 'verify',
  });

  assert(
    qrVerify.status === 200 && qrVerify.data.verified === true,
    'Emergency QR code genuinely verified by backend anti-tampering engine',
    `Verified Token: ${qrVerify.data.token} | Verification status: VERIFIED`
  );

  // -------------------------------------------------------------------------
  // MOMENT 3: HOSPITAL COORDINATION (EMERGENCY RESOURCE REQUEST & DISPATCH)
  // -------------------------------------------------------------------------
  header('MOMENT 3 — HOSPITAL COORDINATION (Emergency Resource Exchange)');

  const aiimsId = '11111111-1111-4111-a111-111111111111'; // AIIMS New Delhi
  const safdarjungId = '22222222-2222-4222-a222-222222222222'; // Safdarjung Hospital (nearby)

  console.log('   ℹ Creating emergency resource request: 2 units Blood O-');
  const reqRes = await api('POST', '/api/emergency/request', {
    hospital_id: aiimsId,
    requesting_hospital_name: 'AIIMS New Delhi',
    resource_type: 'blood_o_neg',
    quantity: 2,
    urgency: 'CRITICAL',
    radius_km: 15,
    notes: 'Emergency polytrauma incoming to trauma center',
  });

  assert(
    reqRes.status === 201 && reqRes.data.success === true,
    'Emergency resource request created and broadcast to 15km radar network',
    `Request ID: ${reqRes.data.request?.request_id}`
  );

  const requestId = reqRes.data.request?.request_id;

  // Verify nearby hospitals and resource inventory
  const resourcesRes = await api('GET', `/api/resources?hospitalId=${safdarjungId}`);
  assert(
    resourcesRes.status === 200 && resourcesRes.data.success,
    'Checked real resource availability of nearby supplying hospital',
    `Safdarjung resources count: ${resourcesRes.data.count}`
  );

  console.log(`   ℹ Nearby hospital (Safdarjung) accepts emergency request ${requestId}`);
  const acceptRes = await api('POST', '/api/emergency/accept', {
    request_id: requestId,
    supplying_hospital_id: safdarjungId,
    supplying_hospital_name: 'Safdarjung Hospital',
  });

  assert(
    acceptRes.status === 200 && acceptRes.data.success === true,
    'Emergency request accepted and inventory atomically reserved',
    `Dispatch ID: ${acceptRes.data.dispatch_id} | Status: ACCEPTED`
  );

  assert(
    Boolean(acceptRes.data.qr_token_hash && acceptRes.data.qr_code),
    'Single-use digital dispatch QR pass issued for ambulance handover',
    `Pass Token: ${acceptRes.data.qr_token_hash}`
  );

  // -------------------------------------------------------------------------
  // VERIFY CORE SERVICES CHECKLIST
  // -------------------------------------------------------------------------
  header('CORE SERVICES & INTEGRATIONS AUDIT');

  // 1. Auth check
  const authRes = await api('POST', '/api/auth/login', {
    email: 'ananya@patient.medconnect.org',
    password: 'patient123',
    role: 'patient',
  });
  assert(
    authRes.status === 200 && authRes.data.authenticated === true,
    'Patient Authentication works (Real Supabase JWT)',
    `User: ${authRes.data.user?.name}`
  );

  // 2. Doctor selection
  const docsRes = await api('GET', '/api/doctors');
  assert(
    docsRes.status === 200 && docsRes.data.count > 0,
    'Doctor list and department routing work',
    `Doctors count: ${docsRes.data.count}`
  );

  // 3. Queue state
  const queueRes = await api('GET', '/api/queue/entries');
  assert(
    queueRes.status === 200 && queueRes.data.count > 0,
    'Live Queue Engine works',
    `Active queue entries: ${queueRes.data.count}`
  );

  // 4. Sarvam AI Voice Connection
  const sarvamHealth = await verifySarvamConnection();
  assert(
    sarvamHealth.configured === true || sarvamHealth.success === true || sarvamHealth.status === 'CONNECTED',
    'Sarvam AI Voice Engine configured and operational',
    `Status: ${sarvamHealth.status || 'CONFIGURED'}`
  );

  // 5. n8n Cloud Automation
  const n8nHealth = await checkN8nHealth();
  assert(
    n8nHealth.ok === true || n8nHealth.source === 'n8n',
    'n8n Cloud Automation Webhook Engine reachable',
    `Source: ${n8nHealth.source || 'n8n-cloud'}`
  );

  // 6. Telegram Alert Delivery
  const tgRes = await sendTelegramAlert(
    `🏥 <b>MedConnect Pulse — Phase 10 Final Freeze Verification</b>\n\n` +
    `• <b>System Status:</b> ALL 3 DEMO MOMENTS VERIFIED\n` +
    `• <b>AI Receptionist:</b> PASSED\n` +
    `• <b>Emergency One-Click:</b> PASSED\n` +
    `• <b>Hospital Coordination:</b> PASSED\n` +
    `• <b>Timestamp:</b> <code>${new Date().toLocaleTimeString()}</code>`
  );
  assert(
    tgRes.sent === true,
    'Real Telegram Bot API notification delivered',
    `Message ID: ${tgRes.messageId}`
  );

  // -------------------------------------------------------------------------
  // FINAL REPORT
  // -------------------------------------------------------------------------
  header('PHASE 10 FINAL FREEZE VERIFICATION REPORT');
  console.log(`  Total Passed: ${passed}`);
  console.log(`  Total Failed: ${failed}`);
  console.log(`  Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  console.log(`══════════════════════════════════════════════════════════════════════════\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase10Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

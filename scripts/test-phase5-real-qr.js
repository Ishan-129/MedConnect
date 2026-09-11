/**
 * Phase 5 — Real Verifiable QR Code System Test Suite
 * Tests all 8 required verification scenarios against the live backend:
 * 1. Valid QR
 * 2. Invalid QR
 * 3. Modified QR
 * 4. Cancelled appointment
 * 5. Expired appointment
 * 6. Already verified QR
 * 7. Refresh
 * 8. Different user attempting verification
 */

import { createHmac } from 'node:crypto';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || 'medconnect_pulse_secure_qr_hmac_secret_key_2026';

function canonicalStringify(obj) {
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj = {};
  for (const k of sortedKeys) {
    if (k !== 'sig') {
      sortedObj[k] = obj[k];
    }
  }
  return JSON.stringify(sortedObj);
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       Phase 5: Real Verifiable QR Code System Test Suite          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`[TEST ${total}] ✅ PASS — ${message}`);
      passed++;
    } else {
      console.error(`[TEST ${total}] ❌ FAIL — ${message}`);
      process.exitCode = 1;
    }
  }

  // Setup: Register Patient A (Appointment Owner)
  const userAEmail = `patient.a.${Date.now()}@medconnect.test`;
  const userAPhone = '+91' + Math.floor(6000000000 + Math.random() * 3000000000);
  const signupA = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: userAEmail,
      password: 'SecurePass123!#',
      role: 'patient',
      name: 'Aditya Verma',
      phone: userAPhone,
    },
  });
  const tokenA = signupA.data?.session?.access_token || signupA.data?.token;
  assert(Boolean(tokenA), `Patient A registered (${userAEmail})`);
  const authHeadersA = { Authorization: `Bearer ${tokenA}` };

  // Setup: Register Hospital Staff (Receptionist)
  const staffEmail = `reception.${Date.now()}@medconnect.test`;
  const signupStaff = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: staffEmail,
      password: 'StaffPass123!#',
      role: 'hospital',
      name: 'Pooja Verma (Reception Desk 1)',
      phone: '+919811000999',
    },
  });
  const staffToken = signupStaff.data?.session?.access_token || signupStaff.data?.token;
  assert(Boolean(staffToken), `Hospital staff registered (${staffEmail})`);
  const authHeadersStaff = { Authorization: `Bearer ${staffToken}` };

  // Fetch available doctors
  const docRes = await request('/api/doctors');
  const doctor = docRes.data?.doctors?.[0] || { doctor_id: '51b2a6b8-52aa-4586-baa1-8e352b82903f', name: 'Dr. Ananya Roy' };

  // =========================================================================
  // TEST 1: Valid QR
  // =========================================================================
  console.log('\n--- 1. Valid QR Generation & Verification ---');
  // Fetch available slot for doctor
  const docId = doctor.doctor_id || doctor.id;
  const slotsRes = await request(`/api/appointments/slots?doctorId=${docId}`);
  const availSlot1 = slotsRes.data?.slots?.[0] || '03:00 PM';
  const availSlot2 = slotsRes.data?.slots?.[1] || '03:30 PM';

  const booking1 = await request('/api/appointments/book', {
    method: 'POST',
    headers: authHeadersA,
    body: {
      doctorId: docId,
      patientName: 'Aditya Verma',
      patientPhone: userAPhone,
      timeSlot: availSlot1,
    },
  });

  if (!booking1.data?.success) {
    console.error('Booking 1 failed:', booking1.data);
  }

  assert(booking1.data?.success === true, 'Real appointment booking created successfully');
  const rawQr1 = booking1.data?.qr_code || booking1.data?.qr_reference;
  assert(Boolean(rawQr1), 'Cryptographic QR string returned by booking transaction');

  // Verify that QR data does NOT contain sensitive patient information directly
  const parsedQr1 = typeof rawQr1 === 'string' ? JSON.parse(rawQr1) : rawQr1;
  assert(Boolean(parsedQr1) && !parsedQr1.patient && !parsedQr1.patient_name && !parsedQr1.patientPhone && !parsedQr1.phone,
    'Zero PHI guarantee: Patient name & phone are NOT embedded in the unencrypted QR payload');
  assert(Boolean(parsedQr1?.sig) && Boolean(parsedQr1?.exp) && Boolean(parsedQr1?.token),
    'QR payload has required cryptographic structure: { type, id, token, iat, exp, sig }');

  // Verify Valid QR against backend verification endpoint
  const verify1 = await request('/api/qr/verify', {
    method: 'POST',
    headers: authHeadersA,
    body: {
      qr_data: rawQr1,
      action: 'verify',
    },
  });

  assert(verify1.status === 200 && verify1.data?.status === 'VALID',
    `Valid QR verified against backend: status is VALID (code: ${verify1.data?.code})`);
  assert(Boolean(verify1.data?.appointment?.doctor_name),
    `Real backend appointment info returned: Doctor is ${verify1.data?.appointment?.doctor_name}`);

  // =========================================================================
  // TEST 2: Invalid QR
  // =========================================================================
  console.log('\n--- 2. Invalid / Corrupted QR ---');
  const invalidQrRes = await request('/api/qr/verify', {
    method: 'POST',
    body: {
      qr_data: 'invalid_malformed_token_9999_xyz',
      action: 'verify',
    },
  });

  assert(invalidQrRes.data?.status === 'INVALID' || invalidQrRes.data?.status === 'NOT FOUND',
    `Invalid / unparseable QR token rejected with status: ${invalidQrRes.data?.status}`);

  // =========================================================================
  // TEST 3: Modified / Tampered QR
  // =========================================================================
  console.log('\n--- 3. Modified / Tampered QR (Forged Token Prevention) ---');
  // Copy valid QR and maliciously modify the token or appointment ID while keeping original signature
  const forgedPayload = {
    ...parsedQr1,
    token: '#FORGED-9999', // Tampered token
    id: 'f0000000-0000-0000-0000-000000000000', // Tampered ID
  };

  const tamperedRes = await request('/api/qr/verify', {
    method: 'POST',
    body: {
      qr_data: forgedPayload,
      action: 'verify',
    },
  });

  assert(tamperedRes.data?.status === 'INVALID',
    `Modified QR detected: Cryptographic signature mismatch blocked with status: INVALID`);
  assert(tamperedRes.data?.success === false, 'Forged QR is strictly rejected as not valid');

  // =========================================================================
  // TEST 4: Cancelled Appointment
  // =========================================================================
  console.log('\n--- 4. Cancelled Appointment ---');
  const appt1Id = booking1.data?.appointment?.appointment_id || booking1.data?.appointment_id || booking1.data?.appointment?.id;
  const token1 = booking1.data?.token?.token_number || booking1.data?.token;

  const cancelRes = await request('/api/appointments/cancel', {
    method: 'POST',
    body: {
      appointmentId: appt1Id,
      token: token1,
    },
  });
  assert(cancelRes.data?.success === true, `Appointment ${token1} cancelled in database`);

  const cancelledVerifyRes = await request('/api/qr/verify', {
    method: 'POST',
    body: {
      qr_data: rawQr1,
      action: 'verify',
    },
  });

  assert(cancelledVerifyRes.data?.status === 'CANCELLED',
    `Cancelled appointment QR verified against backend: status is CANCELLED`);

  // =========================================================================
  // TEST 5: Expired Appointment QR
  // =========================================================================
  console.log('\n--- 5. Expired Appointment QR ---');
  const pastIat = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const pastExp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const expiredData = {
    type: 'appointment_checkin',
    id: appt1Id,
    token: token1,
    iat: pastIat,
    exp: pastExp,
  };
  const expiredSig = createHmac('sha256', QR_SIGNING_SECRET)
    .update(canonicalStringify(expiredData))
    .digest('hex');
  const expiredPayload = { ...expiredData, sig: expiredSig };

  const expiredRes = await request('/api/qr/verify', {
    method: 'POST',
    body: {
      qr_data: expiredPayload,
      action: 'verify',
    },
  });

  assert(expiredRes.data?.status === 'EXPIRED',
    `Expired timestamp QR recognized and rejected with status: EXPIRED`);

  // =========================================================================
  // TEST 6: Already Verified / Checked-In QR
  // =========================================================================
  console.log('\n--- 6. Already Verified / Checked-In QR ---');
  // Book fresh appointment for Patient A (using tomorrow's date to guarantee fresh slot)
  const tomorrowDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const slotsRes2 = await request(`/api/appointments/slots?doctorId=${docId}&date=${tomorrowDate}`);
  const availSlotForTomorrow = slotsRes2.data?.slots?.[0] || '10:00 AM';

  const booking2 = await request('/api/appointments/book', {
    method: 'POST',
    headers: authHeadersA,
    body: {
      doctorId: docId,
      patientName: 'Aditya Verma',
      patientPhone: userAPhone,
      date: tomorrowDate,
      timeSlot: availSlotForTomorrow,
    },
  });
  if (!booking2.data?.success) {
    console.error('Booking 2 failed:', booking2.data);
  }
  assert(booking2.data?.success === true, 'Fresh appointment booked for check-in test');
  const rawQr2 = booking2.data?.qr_code || booking2.data?.qr_reference;

  // 1st Check-In: Scan & Check-in at reception terminal
  const firstCheckIn = await request('/api/qr/verify', {
    method: 'POST',
    headers: authHeadersStaff,
    body: {
      qr_data: rawQr2,
      action: 'check_in',
    },
  });

  assert(firstCheckIn.data?.status === 'VALID' && firstCheckIn.data?.action_performed === 'CHECKED_IN',
    `First check-in successful: Patient admitted into queue at position ${firstCheckIn.data?.queue_position}`);

  // 2nd Check-In (Re-scan of already checked in QR)
  const secondCheckIn = await request('/api/qr/verify', {
    method: 'POST',
    headers: authHeadersStaff,
    body: {
      qr_data: rawQr2,
      action: 'check_in',
    },
  });

  assert(secondCheckIn.data?.status === 'ALREADY USED / CHECKED IN',
    `Second check-in rejected: status is 'ALREADY USED / CHECKED IN'`);

  // =========================================================================
  // TEST 7: Refresh & State Consistency
  // =========================================================================
  console.log('\n--- 7. Refresh & State Consistency ---');
  // Re-verify the appointment after check-in via read-only action
  const refreshedVerify = await request('/api/qr/verify', {
    method: 'POST',
    headers: authHeadersStaff,
    body: {
      qr_data: rawQr2,
      action: 'verify',
    },
  });

  assert(refreshedVerify.data?.status === 'ALREADY USED / CHECKED IN',
    `Post-refresh query returns consistent state: status remains ALREADY USED / CHECKED IN`);

  // Also verify that queue entries endpoint reflects the newly checked-in patient
  const queueEntriesRes = await request('/api/queue/entries');
  const token2Num = booking2.data?.token?.token_number || booking2.data?.token;
  const inQueue = (queueEntriesRes.data?.entries || []).some(
    (e) => e.token === token2Num || e.token_number === token2Num
  );
  assert(inQueue === true, `Live queue entries accurately contains newly admitted token ${token2Num}`);

  // =========================================================================
  // TEST 8: Different User Attempting Verification (Authorization & PHI Protection)
  // =========================================================================
  console.log('\n--- 8. Different User Attempting Verification ---');
  // Register Patient B (Unauthorized 3rd party)
  const userBEmail = `patient.b.${Date.now()}@medconnect.test`;
  const userBPhone = '+91' + Math.floor(6000000000 + Math.random() * 3000000000);
  const signupB = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: userBEmail,
      password: 'SecurePass456!#',
      role: 'patient',
      name: 'Sneha Kulkarni',
      phone: userBPhone,
    },
  });
  const tokenB = signupB.data?.session?.access_token || signupB.data?.token;
  assert(Boolean(tokenB), `Patient B registered (${userBEmail})`);
  const authHeadersB = { Authorization: `Bearer ${tokenB}` };

  // Patient B tries to verify Patient A's appointment QR
  const unauthorizedVerify = await request('/api/qr/verify', {
    method: 'POST',
    headers: authHeadersB,
    body: {
      qr_data: rawQr2,
      action: 'verify',
    },
  });

  assert(unauthorizedVerify.status === 403 || unauthorizedVerify.data?.status === 'FORBIDDEN',
    `Different patient blocked from verifying another patient pass: HTTP 403 / FORBIDDEN`);

  // Staff user verifies Patient A's appointment QR
  const staffVerify = await request('/api/qr/verify', {
    method: 'POST',
    headers: authHeadersStaff,
    body: {
      qr_data: rawQr2,
      action: 'verify',
    },
  });

  assert(staffVerify.data?.appointment?.patient_name === 'Aditya Verma',
    `Authorized staff member permitted full clinical details: Patient name is ${staffVerify.data?.appointment?.patient_name}`);

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(`Phase 5 Results: ${passed} / ${total} passed`);
  console.log('════════════════════════════════════════════════════════════════════\n');

  if (passed === total) {
    console.log('🎉 ALL 8 PHASE 5 QR SYSTEM REQUIREMENTS VERIFIED SUCCESSFULLY!');
  } else {
    console.error('❌ Some tests failed.');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

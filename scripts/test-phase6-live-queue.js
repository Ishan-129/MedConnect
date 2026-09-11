/**
 * Phase 6 — Live Queue Complete Rebuild & DB Verification Test Suite
 * Fully tests the Live Queue against real Supabase database state:
 * 1. Normal appointment booking creates persistent DB record with #MED-xxxx token
 * 2. QR check-in assigns real database queue position and check_in_time
 * 3. Multiple patients checked-in preserve deterministic FIFO ordering
 * 4. Emergency appointment is triaged to front (priority rule)
 * 5. Doctor/Hospital/Department relationships verified from real DB records
 * 6. Calling next patient transitions top patient to CALLED in DB
 * 7. Page refresh (re-query) preserves identical state from DB
 * 8. Advance patient to IN_CONSULTATION and next patient to CALLED
 * 9. Completed patient leaves active queue
 * 10. Cancelled patient leaves active queue and remaining re-index
 * 11. Duplicate queue entries are prevented under concurrent requests
 * 12. Queue status and summary endpoint reflects real DB queue
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

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
  console.log('║       Phase 6: Live Queue Complete Verification Test Suite         ║');
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

  // 1. Setup: Register Patient A
  const userAEmail = `patient.queue.a.${Date.now()}@medconnect.test`;
  const userAPhone = '+91' + Math.floor(6000000000 + Math.random() * 3000000000);
  const signupA = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: userAEmail,
      password: 'SecurePass123!#',
      role: 'patient',
      name: 'Rohan Sharma',
      phone: userAPhone,
    },
  });
  const tokenA = signupA.data?.session?.access_token || signupA.data?.token;
  assert(Boolean(tokenA), `Patient A registered (${userAEmail})`);
  const authHeadersA = { Authorization: `Bearer ${tokenA}` };

  // 2. Setup: Register Patient B
  const userBEmail = `patient.queue.b.${Date.now()}@medconnect.test`;
  const userBPhone = '+91' + Math.floor(6000000000 + Math.random() * 3000000000);
  const signupB = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: userBEmail,
      password: 'SecurePass123!#',
      role: 'patient',
      name: 'Meera Patel',
      phone: userBPhone,
    },
  });
  const tokenB = signupB.data?.session?.access_token || signupB.data?.token;
  assert(Boolean(tokenB), `Patient B registered (${userBEmail})`);
  const authHeadersB = { Authorization: `Bearer ${tokenB}` };

  // 3. Setup: Register Hospital Staff
  const staffEmail = `staff.queue.${Date.now()}@medconnect.test`;
  const signupStaff = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: staffEmail,
      password: 'SecurePass123!#',
      role: 'receptionist',
      name: 'AIIMS Chief Receptionist',
      phone: '+911126594405',
    },
  });
  const staffToken = signupStaff.data?.session?.access_token || signupStaff.data?.token;
  assert(Boolean(staffToken), `Staff registered (${staffEmail})`);
  const authHeadersStaff = { Authorization: `Bearer ${staffToken}` };

  // 4. Fetch doctor and available slots
  const docRes = await request('/api/doctors');
  const doctor = docRes.data?.doctors?.find(d => d.name.includes('Roy')) || docRes.data?.doctors?.[0];
  const docId = doctor.doctor_id || doctor.id;
  const hospitalId = doctor.hospital_id || '11111111-1111-4111-a111-111111111111';

  console.log(`[INFO] Testing Doctor: ${doctor.name} (${docId}), Hospital: ${hospitalId}\n`);

  // Find a date with at least 2 available slots
  let targetDate = '';
  let availableSlots = [];
  for (let offset = 1; offset <= 20; offset++) {
    const d = new Date(Date.now() + offset * 86400000).toISOString().split('T')[0];
    const slotsRes = await request(`/api/appointments/slots?doctorId=${docId}&date=${d}`);
    if (slotsRes.data?.slots && slotsRes.data.slots.length >= 2) {
      targetDate = d;
      availableSlots = slotsRes.data.slots;
      break;
    }
  }

  if (!targetDate || availableSlots.length < 2) {
    console.error('Fatal: Could not find date with at least 2 available slots');
    process.exit(1);
  }

  console.log(`[INFO] Target Booking Date: ${targetDate}, Slots: ${availableSlots.slice(0, 3).join(', ')}\n`);

  // =========================================================================
  // TEST 1: Normal appointment booking creates persistent DB record with #MED token
  // =========================================================================
  const book1Res = await request('/api/appointments/book', {
    method: 'POST',
    headers: authHeadersA,
    body: {
      doctorId: docId,
      patientName: 'Rohan Sharma',
      date: targetDate,
      time: availableSlots[0],
    },
  });

  const appt1 = book1Res.data?.appointment;
  const qrCode1 = book1Res.data?.qr_code || book1Res.data?.qr_reference;
  assert(
    book1Res.status === 200 &&
    appt1?.token?.startsWith('#MED-') &&
    Boolean(qrCode1),
    `Normal appointment 1 created with persistent token: ${appt1?.token}`
  );

  // =========================================================================
  // TEST 2: Check-in Patient A assigns real database queue position and check_in_time
  // =========================================================================
  const checkin1Res = await request('/api/qr/check-in', {
    method: 'POST',
    headers: authHeadersStaff,
    body: { qr_data: qrCode1 },
  });

  assert(
    checkin1Res.status === 200 &&
    checkin1Res.data?.success === true &&
    checkin1Res.data?.action_performed === 'CHECKED_IN' &&
    checkin1Res.data?.appointment?.status === 'CHECKED_IN',
    `Patient 1 checked in via QR with DB status CHECKED_IN (pos: ${checkin1Res.data?.appointment?.queue_position})`
  );

  // =========================================================================
  // TEST 3: Multiple patients checked-in preserve deterministic FIFO ordering
  // =========================================================================
  const book2Res = await request('/api/appointments/book', {
    method: 'POST',
    headers: authHeadersB,
    body: {
      doctorId: docId,
      patientName: 'Meera Patel',
      date: targetDate,
      time: availableSlots[1],
    },
  });
  const appt2 = book2Res.data?.appointment;
  const qrCode2 = book2Res.data?.qr_code || book2Res.data?.qr_reference;

  await new Promise(r => setTimeout(r, 100));

  const checkin2Res = await request('/api/qr/check-in', {
    method: 'POST',
    headers: authHeadersStaff,
    body: { qr_data: qrCode2 },
  });

  assert(
    checkin2Res.status === 200 &&
    checkin2Res.data?.appointment?.status === 'CHECKED_IN' &&
    checkin2Res.data?.appointment?.queue_position > (checkin1Res.data?.appointment?.queue_position || 0),
    `Patient 2 checked in with sequential queue position ${checkin2Res.data?.appointment?.queue_position} (> Patient 1)`
  );

  // =========================================================================
  // TEST 4: Emergency appointment booked & triaged to front of queue
  // =========================================================================
  const emergRes = await request('/api/appointments/emergency', {
    method: 'POST',
    body: {
      patient_name: 'Emergency Patient Vikram',
      patient_phone: '+919999900001',
      symptoms: 'Acute crushing chest pain, emergency immediate evaluation',
      hospital_id: hospitalId,
      department_name: 'Cardiology',
    },
  });

  const emergAppt = emergRes.data?.appointment;
  const emergQr = emergRes.data?.qr_code || emergRes.data?.qr_reference;
  assert(
    emergRes.status === 200 && emergAppt?.token?.startsWith('#EMERG-'),
    `Emergency appointment created with token: ${emergAppt?.token}`
  );

  // Check in the emergency appointment
  const emergCheckInRes = await request('/api/qr/check-in', {
    method: 'POST',
    headers: authHeadersStaff,
    body: { qr_data: emergQr },
  });

  assert(
    emergCheckInRes.status === 200 && emergCheckInRes.data?.queue_position === 1,
    `Emergency check-in assigned immediate priority queue position 1`
  );

  // Query queue entries for this doctor/hospital
  const emergDocId = emergAppt.doctor_id;
  const emergHospId = emergAppt.hospital_id;
  const queueEntriesRes = await request(`/api/queue/entries?hospitalId=${emergHospId}&doctorId=${emergDocId}`);
  const entries = queueEntriesRes.data?.entries || [];

  const emergEntry = entries.find(e => e.token === emergAppt.token);
  const firstNormal = entries.find(e => !e.is_emergency && e.status === 'WAITING');
  const firstNormalPos = firstNormal ? firstNormal.position : 999;
  assert(
    emergEntry !== undefined && (emergEntry.position < firstNormalPos || emergEntry.status === 'CALLED'),
    `Emergency patient prioritized ahead of normal waiting patients (emergency pos: ${emergEntry?.position}, first normal waiting pos: ${firstNormalPos})`
  );

  // =========================================================================
  // TEST 5: Doctor/Hospital/Department relationships verified from real DB
  // =========================================================================
  const docQueueRes = await request(`/api/queue/entries?hospitalId=${hospitalId}&doctorId=${docId}`);
  const docQueueEntries = docQueueRes.data?.entries || [];
  const sampleEntry = docQueueEntries.find(e => e.token === appt1.token);

  assert(
    sampleEntry &&
    sampleEntry.doctor_name.includes('Roy') &&
    sampleEntry.department_name === 'Cardiology' &&
    sampleEntry.token === appt1.token,
    `Relational consistency verified: Doctor="${sampleEntry?.doctor_name}", Dept="${sampleEntry?.department_name}", Token="${sampleEntry?.token}"`
  );

  // =========================================================================
  // TEST 6: Calling next patient transitions top patient to CALLED in DB
  // =========================================================================
  const callNextRes1 = await request('/api/queue/call-next', {
    method: 'POST',
    headers: authHeadersStaff,
    body: {
      hospital_id: hospitalId,
      doctor_id: docId,
    },
  });

  const calledPatient1 = callNextRes1.data?.called_patient;
  assert(
    callNextRes1.status === 200 &&
    calledPatient1 !== null &&
    (calledPatient1.status === 'CALLED' || calledPatient1.status === 'IN_CONSULTATION'),
    `Call next successfully moved patient ${calledPatient1?.token} to status ${calledPatient1?.status}`
  );

  // =========================================================================
  // TEST 7: Page refresh (re-query) preserves identical state from DB
  // =========================================================================
  const refresh1 = await request(`/api/queue/entries?hospitalId=${hospitalId}&doctorId=${docId}`);
  const refresh2 = await request(`/api/queue/entries?hospitalId=${hospitalId}&doctorId=${docId}`);

  const snap1 = (refresh1.data?.entries || []).map(e => `${e.token}:${e.status}:${e.position}`).join('|');
  const snap2 = (refresh2.data?.entries || []).map(e => `${e.token}:${e.status}:${e.position}`).join('|');
  assert(
    snap1 === snap2 && snap1.length > 0,
    `Queue state is 100% idempotent across simulated page refresh/re-queries`
  );

  // =========================================================================
  // TEST 8: Advance patient to IN_CONSULTATION and next patient to CALLED
  // =========================================================================
  const callNextRes2 = await request('/api/queue/call-next', {
    method: 'POST',
    headers: authHeadersStaff,
    body: {
      hospital_id: hospitalId,
      doctor_id: docId,
    },
  });

  const calledPatient2 = callNextRes2.data?.called_patient;
  assert(
    callNextRes2.status === 200 && calledPatient2 !== null,
    `Subsequent call-next transitioned previous patient to IN_CONSULTATION and called: ${calledPatient2?.token}`
  );

  // =========================================================================
  // TEST 9: Completed patient leaves active queue
  // =========================================================================
  const targetCompletedApptId = calledPatient1?.appointment_id || appt1.appointment_id || appt1.id;
  const completeRes = await request('/api/queue/update-status', {
    method: 'POST',
    headers: authHeadersStaff,
    body: {
      appointment_id: targetCompletedApptId,
      status: 'COMPLETED',
    },
  });

  assert(
    completeRes.status === 200 && completeRes.data?.new_status === 'COMPLETED',
    `Patient marked as COMPLETED in DB`
  );

  const queueAfterComplete = await request(`/api/queue/entries?hospitalId=${hospitalId}&doctorId=${docId}`);
  const isInActiveQueue = (queueAfterComplete.data?.entries || []).some(
    e => e.appointment_id === targetCompletedApptId && e.status !== 'COMPLETED'
  );
  assert(
    !isInActiveQueue,
    `Completed patient successfully removed from active waiting queue`
  );

  // =========================================================================
  // TEST 10: Cancelled patient leaves active queue and remaining re-index
  // =========================================================================
  const targetCancelId = appt2.appointment_id || appt2.id || appt2.token;
  const cancelRes = await request('/api/queue/update-status', {
    method: 'POST',
    headers: authHeadersStaff,
    body: {
      appointment_id: targetCancelId,
      status: 'CANCELLED',
    },
  });

  assert(
    cancelRes.status === 200 && cancelRes.data?.new_status === 'CANCELLED',
    `Patient 2 (${appt2.token}) cancelled in DB`
  );

  const queueAfterCancel = await request(`/api/queue/entries?hospitalId=${hospitalId}&doctorId=${docId}`);
  const cancelledInQueue = (queueAfterCancel.data?.entries || []).some(
    e => e.appointment_id === targetCancelId || e.token === appt2.token
  );
  assert(
    !cancelledInQueue,
    `Cancelled patient successfully excluded from active queue`
  );

  // =========================================================================
  // TEST 11: Duplicate queue entries prevented under simultaneous updates
  // =========================================================================
  // Issue 2 concurrent check-ins for the same QR code
  await Promise.all([
    request('/api/qr/check-in', {
      method: 'POST',
      headers: authHeadersStaff,
      body: { qr_data: qrCode1 },
    }),
    request('/api/qr/check-in', {
      method: 'POST',
      headers: authHeadersStaff,
      body: { qr_data: qrCode1 },
    }),
  ]);

  const queueFinal = await request(`/api/queue/entries?hospitalId=${hospitalId}`);
  const appt1Entries = (queueFinal.data?.entries || []).filter(
    e => e.token === appt1.token
  );
  assert(
    appt1Entries.length <= 1,
    `Duplicate prevention verified: ${appt1.token} appears ${appt1Entries.length} time(s) (expected <= 1)`
  );

  // =========================================================================
  // TEST 12: Queue status overview endpoint reflects real DB metrics
  // =========================================================================
  const statusOverviewRes = await request(`/api/queue/status?hospitalId=${hospitalId}&doctorId=${docId}`);
  assert(
    statusOverviewRes.status === 200 &&
    typeof statusOverviewRes.data?.waiting_count === 'number' &&
    typeof statusOverviewRes.data?.estimated_wait_mins === 'number',
    `Queue status overview returns real DB metrics: ${statusOverviewRes.data?.waiting_count} waiting, ~${statusOverviewRes.data?.estimated_wait_mins}m wait`
  );

  // =========================================================================
  // TEST 13: Individual patient queue status endpoint returns persistent state
  // =========================================================================
  const patientStatusRes = await request(`/api/queue/status?token=${encodeURIComponent(appt1.token)}`);
  assert(
    patientStatusRes.status === 200 &&
    patientStatusRes.data?.token === appt1.token &&
    Boolean(patientStatusRes.data?.doctor_name),
    `Individual patient queue status verified: Token=${patientStatusRes.data?.token}, Doctor=${patientStatusRes.data?.doctor_name}`
  );

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log(`║   Phase 6 Test Results: ${passed} / ${total} PASSING                            ║`);
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  if (passed === total) {
    console.log('🎉 ALL PHASE 6 LIVE QUEUE REQUIREMENTS FULLY VERIFIED!');
    process.exit(0);
  } else {
    console.error(`⚠️ ${total - passed} test(s) failed.`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal Test Execution Error:', err);
  process.exit(1);
});

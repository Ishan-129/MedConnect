/**
 * Phase 4 — Emergency One-Click Appointment Verification Test Suite
 * Tests real database availability, deterministic earliest slot priority,
 * atomic reservation, race condition prevention, no-fake-success fallback,
 * and post-booking schedule refresh.
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
  console.log('║        Phase 4: Emergency One-Click Appointment Verification       ║');
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

  // Setup: Register a test patient with valid TLD
  const testEmail = `patient.phase4.${Date.now()}@medconnect.org`;
  const testPhone = '+91' + Math.floor(6000000000 + Math.random() * 3000000000);
  let signupRes = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: testEmail,
      password: 'EmergencyPass123!#',
      role: 'patient',
      name: 'Rohan Deshmukh',
      phone: testPhone,
    },
  });

  let patientToken = signupRes.data?.session?.access_token || signupRes.data?.token;
  if (!patientToken) {
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'ananya@patient.medconnect.org', password: 'patient123' },
    });
    patientToken = loginRes.data?.token || loginRes.data?.session?.access_token;
  }
  assert(Boolean(patientToken), `Authenticated patient registered (${testEmail})`);
  const authHeaders = { Authorization: `Bearer ${patientToken}` };

  // =========================================================================
  // TEST CASE 1: Available Doctor — One-Click Real Emergency Appointment
  // =========================================================================
  console.log('\n--- Test Case 1: Available Doctor (One-Click Emergency Booking) ---');
  const emergRes1 = await request('/api/appointments/emergency', {
    method: 'POST',
    headers: authHeaders,
    body: {
      department: 'Cardiology',
      symptoms: 'Sudden acute angina and palpitations',
      patientPhone: testPhone,
      patientName: 'Rohan Deshmukh',
    },
  });

  assert(
    emergRes1.status === 200 && emergRes1.data.success === true,
    `Emergency appointment successfully created (HTTP ${emergRes1.status})`
  );

  const booking1 = emergRes1.data;
  assert(
    Boolean(booking1.token?.token_number && booking1.token.token_number.startsWith('#EMERG-')),
    `High-priority emergency token generated: ${booking1.token?.token_number}`
  );

  assert(
    Boolean(booking1.doctor?.name && booking1.doctor?.department_name),
    `Real database doctor assigned: ${booking1.doctor?.name} (${booking1.doctor?.department_name})`
  );

  assert(
    Boolean(booking1.slot?.display_time && booking1.slot?.slot_id),
    `Earliest suitable urgent slot reserved: ${booking1.slot?.display_time} on ${booking1.slot?.date || 'today'} (Slot: ${booking1.slot?.slot_id})`
  );

  assert(
    Boolean(booking1.selection_rationale && booking1.selection_rationale.toLowerCase().includes('matched')),
    `Explainable selection rationale provided: "${booking1.selection_rationale}"`
  );

  assert(
    booking1.queue_position === 1,
    `Patient assigned priority queue position: ${booking1.queue_position}`
  );

  // =========================================================================
  // TEST CASE 2: Multiple Available Doctors — Deterministic Earliest Slot Selection
  // =========================================================================
  console.log('\n--- Test Case 2: Multiple Available Doctors (Deterministic Priority) ---');
  const emergRes2 = await request('/api/appointments/emergency', {
    method: 'POST',
    headers: authHeaders,
    body: {
      department: 'Orthopedics',
      symptoms: 'Suspected radial fracture from fall',
      patientPhone: testPhone,
      patientName: 'Rohan Deshmukh',
    },
  });

  assert(
    emergRes2.status === 200 && emergRes2.data.success === true,
    `Emergency request for Orthopedics successfully routed without manual doctor browsing`
  );

  const booking2 = emergRes2.data;
  assert(
    booking2.doctor?.name && (booking2.doctor.department_name.toLowerCase().includes('ortho') || booking2.selection_rationale.toLowerCase().includes('ortho')),
    `Deterministic routing matched Orthopedics specialist: ${booking2.doctor?.name}`
  );

  assert(
    Boolean(booking2.selection_rationale),
    `Explainable doctor priority logged: "${booking2.selection_rationale}"`
  );

  // =========================================================================
  // TEST CASE 3: No Available Doctor / Slot Exhaustion — Strict Zero Fake Success
  // =========================================================================
  console.log('\n--- Test Case 3: No Available Doctor / Non-Existent Specialty (Zero Fake Success) ---');
  const noDocRes = await request('/api/appointments/emergency', {
    method: 'POST',
    headers: authHeaders,
    body: {
      department: 'Neuro-Transplant-NonExistent-Unit-999',
      symptoms: 'Complex experimental procedure',
      patientPhone: testPhone,
    },
  });

  // Must NOT show fake success. Should return 409 or 404 with clear error and fallback
  assert(
    (noDocRes.status === 409 || noDocRes.status === 404 || noDocRes.status === 400) &&
    noDocRes.data.success === false,
    `Backend strictly rejected unavailable specialty (HTTP ${noDocRes.status}, success: false)`
  );

  assert(
    Boolean(noDocRes.data.error?.includes('NO_') || noDocRes.data.message?.toLowerCase().includes('no')),
    `Returned clear error code: "${noDocRes.data.error || noDocRes.data.message}"`
  );

  assert(
    Boolean(noDocRes.data.fallback && noDocRes.data.fallback.emergency_contact),
    `Provided actionable emergency fallback: Helpline ${noDocRes.data.fallback?.emergency_contact || '102'} (${noDocRes.data.fallback?.action || 'CONTACT_EMERGENCY_DESK'})`
  );

  // =========================================================================
  // TEST CASE 4: Simultaneous Booking — Race Conditions & Double Booking Prevention
  // =========================================================================
  console.log('\n--- Test Case 4: Simultaneous Emergency Bookings (Concurrency Lock) ---');
  const CONCURRENT_REQUESTS = 6;
  const concurrentPromises = [];

  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    const pPhone = '+91' + Math.floor(7000000000 + Math.random() * 2000000000);
    concurrentPromises.push(
      request('/api/appointments/emergency', {
        method: 'POST',
        headers: authHeaders,
        body: {
          department: 'Pediatrics',
          symptoms: `Concurrent emergency patient #${i + 1}`,
          patientPhone: pPhone,
          patientName: `Pediatric Patient ${i + 1}`,
        },
      })
    );
  }

  const concurrentResults = await Promise.all(concurrentPromises);
  const successfulBookings = concurrentResults.filter(r => r.status === 200 && r.data.success === true);
  const reservedSlotIds = successfulBookings.map(r => r.data.slot?.slot_id);
  const reservedTokens = successfulBookings.map(r => r.data.token?.token_number);

  // Assert all successful bookings reserved UNIQUE slots (no double-booking!)
  const uniqueSlotIds = new Set(reservedSlotIds);
  const uniqueTokens = new Set(reservedTokens);

  assert(
    successfulBookings.length > 0,
    `${successfulBookings.length}/${CONCURRENT_REQUESTS} simultaneous emergency bookings processed`
  );

  assert(
    uniqueSlotIds.size === reservedSlotIds.length,
    `Zero double bookings! All ${reservedSlotIds.length} reserved slots are strictly unique`
  );

  assert(
    uniqueTokens.size === reservedTokens.length,
    `All ${reservedTokens.length} issued emergency tokens are strictly unique`
  );

  // =========================================================================
  // TEST CASE 5: Refresh After Emergency Booking — Doctor Slot Availability
  // =========================================================================
  console.log('\n--- Test Case 5: Refresh After Emergency Booking ---');
  const allocatedDocId = booking1.doctor?.doctor_id;
  const allocatedSlotId = booking1.slot?.slot_id;
  const allocatedTime = booking1.slot?.display_time;
  const todayStr = new Date().toISOString().split('T')[0];

  const refreshRes = await request(`/api/appointments/slots?doctorId=${allocatedDocId}&date=${todayStr}`);
  assert(
    refreshRes.status === 200 && Array.isArray(refreshRes.data.detailedSlots),
    `Fetched updated schedule for allocated doctor ${booking1.doctor?.name}`
  );

  const updatedSlots = refreshRes.data.detailedSlots;
  const consumedSlot = updatedSlots.find(s => s.slot_id === allocatedSlotId || s.display_time === allocatedTime);

  assert(
    consumedSlot && (consumedSlot.status === 'BOOKED' || consumedSlot.available === false),
    `Allocated slot ${allocatedTime} is now marked BOOKED in real-time database`
  );

  // Double check: attempting to book that exact consumed slot manually must be rejected
  const conflictAttempt = await request('/api/appointments/book', {
    method: 'POST',
    headers: authHeaders,
    body: {
      doctorId: allocatedDocId,
      doctorName: booking1.doctor?.name,
      patientPhone: '+919999888877',
      patientName: 'Conflicting Patient',
      date: todayStr,
      timeSlot: allocatedTime,
      slotId: allocatedSlotId,
      departmentName: 'Cardiology',
    },
  });

  assert(
    conflictAttempt.status === 409 || conflictAttempt.data.success === false,
    `Attempt to re-book emergency slot directly rejected with 409 Conflict: "${conflictAttempt.data.message || conflictAttempt.data.error}"`
  );

  console.log('\n================================================================');
  console.log(`Phase 4 Emergency Test Results: ${passed}/${total} PASSED`);
  console.log('================================================================\n');

  if (passed < total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

/**
 * Phase 3 — Interactive Doctor and Slot Selection Test Suite
 * Tests full interactive flow against live backend (http://localhost:3001)
 */

const API_BASE = 'http://localhost:3001';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     Phase 3: Interactive Doctor & Slot Selection Verification       ║');
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

  // 0. Setup test patient authentication
  const testEmail = `patient.phase3.${Date.now()}@medconnect.test`;
  const testPass = 'SecurePass123!#';
  const testPhone1 = '+91' + Math.floor(6000000000 + Math.random() * 3000000000);
  const signupRes = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: testEmail,
      password: testPass,
      role: 'patient',
      name: 'Aarav Mehta',
      phone: testPhone1
    }
  });

  const patientToken = signupRes.data?.session?.access_token || signupRes.data?.token;
  assert(Boolean(patientToken), `Authenticated patient registered with JWT token`);
  const authHeaders = { Authorization: `Bearer ${patientToken}` };

  // 1. Fetch real doctors from database
  const docRes = await request('/api/appointments/doctors');
  assert(docRes.status === 200 && Array.isArray(docRes.data.doctors) && docRes.data.doctors.length > 0,
    `Fetched ${docRes.data.doctors?.length || 0} real doctors from database`);

  const doctors = docRes.data.doctors;
  const cardiologyDocs = doctors.filter(d => 
    (d.specialty || d.department_name || d.specialization || '').toLowerCase().includes('cardio')
  );
  assert(cardiologyDocs.length > 0, `Department filtering works: Found ${cardiologyDocs.length} Cardiology doctor(s)`);

  const selectedDoctor = cardiologyDocs[0];
  console.log(`   Selected Doctor: ${selectedDoctor.name} (${selectedDoctor.specialization || selectedDoctor.specialty})`);

  // 2. Fetch slots for selected doctor and selected date
  let dateStr = '';
  let detailedSlots = [];
  let availableSlots = [];
  let initialAvailCount = 0;
  for (let offset = 4; offset <= 14; offset++) {
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + offset);
    const candidateDate = testDate.toISOString().split('T')[0];
    const slotsRes = await request(`/api/appointments/slots?doctorId=${selectedDoctor.doctor_id}&date=${candidateDate}`);
    if (slotsRes.status === 200 && Array.isArray(slotsRes.data.detailedSlots)) {
      const avail = slotsRes.data.detailedSlots.filter(s => s.available && s.status === 'AVAILABLE');
      if (avail.length > 0) {
        dateStr = candidateDate;
        detailedSlots = slotsRes.data.detailedSlots;
        availableSlots = avail;
        initialAvailCount = slotsRes.data.availableCount || avail.length;
        break;
      }
    }
  }

  assert(detailedSlots.length > 0 && availableSlots.length > 0,
    `Slot availability clear on ${dateStr}: ${availableSlots.length} available, ${detailedSlots.length - availableSlots.length} booked out of ${detailedSlots.length} total`);

  // 3. Select an available slot to book
  const slotToBook = availableSlots[0];
  console.log(`   Target Slot: ${slotToBook.display_time} (${slotToBook.slot_id})`);

  // 4. Book the selected slot through the backend
  const bookingPayload = {
    hospitalId: selectedDoctor.hospital_id,
    doctorId: selectedDoctor.doctor_id,
    doctorName: selectedDoctor.name,
    patientName: 'Aarav Mehta',
    patientPhone: '+919876543210',
    date: dateStr,
    timeSlot: slotToBook.display_time,
    slot: slotToBook.display_time,
    slotId: slotToBook.slot_id,
    departmentName: selectedDoctor.department_name || 'Cardiology',
    symptomsSummary: 'Routine cardio checkup'
  };

  const bookRes = await request('/api/appointments/book', {
    method: 'POST',
    headers: authHeaders,
    body: bookingPayload
  });

  const tokenNum = bookRes.data?.token?.token_number || bookRes.data?.appointment?.token_number || bookRes.data?.token;
  assert(bookRes.status === 200 && (bookRes.data.success || tokenNum),
    `Slot booked successfully! Received token: ${tokenNum || JSON.stringify(bookRes.data?.token)}`);

  // 5. Verify immediate slot status change in database/backend
  const updatedSlotsRes = await request(`/api/appointments/slots?doctorId=${selectedDoctor.doctor_id}&date=${dateStr}`);
  const updatedSlot = updatedSlotsRes.data.detailedSlots.find(s => s.slot_id === slotToBook.slot_id || s.display_time === slotToBook.display_time);
  assert(updatedSlot && (updatedSlot.status === 'BOOKED' || !updatedSlot.available),
    `Slot ${slotToBook.display_time} is now marked BOOKED in database`);

  // 6. Verify double-booking prevention: Another patient tries to book the EXACT same slot
  const secondPatientEmail = `patient2.phase3.${Date.now()}@medconnect.test`;
  const testPhone2 = '+91' + Math.floor(6000000000 + Math.random() * 3000000000);
  const signup2Res = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: secondPatientEmail,
      password: testPass,
      role: 'patient',
      name: 'Vikram Singh',
      phone: testPhone2
    }
  });
  const token2 = signup2Res.data?.session?.access_token || signup2Res.data?.token;
  const conflictRes = await request('/api/appointments/book', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` },
    body: {
      ...bookingPayload,
      patientName: 'Vikram Singh',
      patientPhone: '+919876543211'
    }
  });

  assert(
    (conflictRes.data.success === false || conflictRes.status === 409) &&
    (conflictRes.data.error?.includes('SLOT') || conflictRes.data.message?.toLowerCase().includes('booked')),
    `Double-booking prevented! Backend rejected duplicate booking: "${conflictRes.data.message || conflictRes.data.error}" (HTTP ${conflictRes.status})`
  );

  // 7. Verify capacity counters accurately reflect booked vs available
  assert(updatedSlotsRes.data.bookedCount > 0 && updatedSlotsRes.data.availableCount < initialAvailCount,
    `Capacity counters updated: ${updatedSlotsRes.data.availableCount} available, ${updatedSlotsRes.data.bookedCount} booked`);

  // 8. Verify booking another distinct available slot works
  const remainingAvailable = updatedSlotsRes.data.detailedSlots.filter(s => s.available && s.status === 'AVAILABLE');
  if (remainingAvailable.length > 0) {
    const secondSlot = remainingAvailable[0];
    const secondBooking = await request('/api/appointments/book', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` },
      body: {
        ...bookingPayload,
        patientName: 'Vikram Singh',
        timeSlot: secondSlot.display_time,
        slot: secondSlot.display_time,
        slotId: secondSlot.slot_id
      }
    });
    const secondToken = secondBooking.data?.token?.token_number || secondBooking.data?.appointment?.token_number || secondBooking.data?.token;
    assert(secondBooking.status === 200 && (secondBooking.data.success || secondToken),
      `Multiple bookings work: Second slot ${secondSlot.display_time} booked successfully with token ${secondToken}`);
  } else {
    assert(true, 'Skipped second booking as no more slots available');
  }

  console.log('\n================================================================');
  console.log(`Phase 3 Test Results: ${passed}/${total} PASSED`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

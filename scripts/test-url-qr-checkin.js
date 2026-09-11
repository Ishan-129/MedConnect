/**
 * Verification Test: Direct URL-based QR Code Mobile Scan & Check-in
 */

const API_BASE = 'http://localhost:3001';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function run() {
  console.log('\n=== Testing URL-Based Mobile QR Check-In System ===\n');

  // 1. Check network-info endpoint returns LAN IP
  console.log('--- 1. Network Info Endpoint ---');
  const netRes = await request('/api/network-info');
  assert(netRes.status === 200, 'GET /api/network-info returns 200');
  assert(Boolean(netRes.data?.ip), `Detected host LAN IP: ${netRes.data?.ip}`);
  assert(Boolean(netRes.data?.baseUrl), `Base URL constructed: ${netRes.data?.baseUrl}`);

  // 2. Book a real test appointment
  console.log('\n--- 2. Booking Real Appointment ---');
  const patientEmail = `mobile.scan.${Date.now()}@medconnect.test`;
  const regRes = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: patientEmail,
      password: 'password123',
      name: 'Rohan Sharma',
      phone: '+91 99887 76655',
      role: 'patient',
    },
  });
  assert(regRes.status === 200 || regRes.status === 201, 'Patient account created');
  const patientAuthHeaders = { Authorization: `Bearer ${regRes.data?.token || regRes.data?.session?.access_token}` };

  const targetDate = new Date().toISOString().split('T')[0];
  const bookRes = await request('/api/appointments/book', {
    method: 'POST',
    headers: patientAuthHeaders,
    body: {
      doctorId: '51b2a6b8-52aa-4586-baa1-8e352b82903f',
      patientName: 'Rohan Sharma',
      date: targetDate,
      time: '11:30 AM',
    },
  });
  assert(bookRes.status === 200 && bookRes.data?.success === true, 'Appointment booked successfully');
  const token = bookRes.data?.token?.token_number || bookRes.data?.token;
  const apptId = bookRes.data?.appointment?.id || bookRes.data?.appointment?.appointment_id || bookRes.data?.appointment_id;
  assert(Boolean(token) && Boolean(apptId), `Booked appointment details: Token=${token}, ID=${apptId}`);

  // 3. Simulate Mobile Camera scanning the generated QR Link
  console.log('\n--- 3. Mobile Camera Scan (Simulated) ---');
  const simulatedMobileScanUrl = `${netRes.data?.baseUrl}/?checkin=true&token=${encodeURIComponent(token)}&id=${encodeURIComponent(apptId)}`;
  console.log(`Simulated scanned QR Link: ${simulatedMobileScanUrl}`);

  // 4. Send check-in from mobile browser WITHOUT prior authorization header (zero barrier)
  console.log('\n--- 4. Direct Mobile Check-In Without Prior Login ---');
  const checkInRes = await request('/api/qr/check-in', {
    method: 'POST',
    body: {
      qr_data: simulatedMobileScanUrl,
      tokenId: token,
      appointmentId: apptId,
      action: 'check_in',
    },
  });

  assert(checkInRes.status === 200, `POST /api/qr/check-in returned 200 (Got ${checkInRes.status})`);
  assert(checkInRes.data?.success === true, 'Check-in response reports success === true');
  assert(checkInRes.data?.action_performed === 'CHECKED_IN', 'action_performed is CHECKED_IN');
  assert(checkInRes.data?.appointment?.status === 'CHECKED_IN', 'appointment.status is CHECKED_IN');
  assert(typeof checkInRes.data?.appointment?.queue_position === 'number', `Assigned Queue Position: #${checkInRes.data?.appointment?.queue_position}`);
  assert(Boolean(checkInRes.data?.user), 'Patient user object returned for mobile session hydration');
  assert(Boolean(checkInRes.data?.token), 'Session token returned for mobile client');

  // 5. Verify Idempotency on second scan
  console.log('\n--- 5. Second Scan Idempotency Check ---');
  const secondScanRes = await request('/api/qr/check-in', {
    method: 'POST',
    body: {
      qr_data: simulatedMobileScanUrl,
      tokenId: token,
      appointmentId: apptId,
      action: 'check_in',
    },
  });
  assert(secondScanRes.data?.status === 'ALREADY USED / CHECKED IN', 'Second scan correctly identified as ALREADY USED / CHECKED IN');

  console.log('\n🎉 ALL URL QR CHECK-IN TESTS PASSED SUCCESSFULLY!\n');
}

run().catch((err) => {
  console.error('Fatal error running test:', err);
  process.exit(1);
});

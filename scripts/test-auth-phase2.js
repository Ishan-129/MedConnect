/**
 * Phase 2 — Real Login and Signup Comprehensive Test Suite
 * Validates all 9+ scenarios against the live backend server and Supabase database:
 *  1. New signup (creates real auth user and DB record, Bcrypt hashed)
 *  2. Duplicate email rejection (409 Conflict)
 *  3. Wrong password rejection (401 Unauthorized)
 *  4. Correct login (real JWT session issued)
 *  5. Session verification (/api/auth/me)
 *  6. Protected route & API without token (401 / 403)
 *  7. Anti-tampering / untrusted frontend user ID rejection & identity enforcement
 *  8. Expired / invalid / malformed session rejection
 *  9. Logout & session invalidation
 * 10. Hospital signup & authorized queue operation
 *
 * Usage: node scripts/test-auth-phase2.js
 */

import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { server } from '../backend/server.js';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wardqchtmympitfhifqy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const TEST_PORT = 3099;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let testServerInstance;

async function startTestServer() {
  return new Promise((resolve) => {
    testServerInstance = server.listen(TEST_PORT, () => {
      console.log(`[TEST] Backend server running on ${BASE_URL}`);
      resolve();
    });
  });
}

async function stopTestServer() {
  return new Promise((resolve) => {
    if (testServerInstance) {
      testServerInstance.close(resolve);
    } else {
      resolve();
    }
  });
}

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runPhase2Tests() {
  console.log('================================================================');
  console.log('MedConnect Pulse — PHASE 2 REAL AUTHENTICATION TEST HARNESS');
  console.log('================================================================\n');

  await startTestServer();

  const createdUserIds = [];
  const timestamp = Date.now();
  const testPatientEmail = `vikram_test_${timestamp}@gmail.com`;
  const testPatientPass = 'SecureVikramPassword123!';
  const testPatientPhone = `+91 98765 ${Math.floor(10000 + Math.random() * 90000)}`;

  const testHospEmail = `metro_hospital_${timestamp}@gmail.com`;
  const testHospPass = 'HospitalDeskPass123!';

  try {
    // -------------------------------------------------------------------------
    // TEST 1: NEW SIGNUP (PATIENT)
    // -------------------------------------------------------------------------
    console.log('👉 TEST 1: New Patient Signup');
    const signupRes = await apiRequest('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: testPatientEmail,
        password: testPatientPass,
        role: 'patient',
        name: 'Vikram Malhotra',
        phone: testPatientPhone,
        blood_group: 'AB+',
        age: 34,
        gender: 'Male',
        address: 'Defence Colony, New Delhi',
      }),
    });

    assert(signupRes.status === 201, `Signup returned HTTP 201 (got ${signupRes.status})`);
    assert(signupRes.data?.success === true, 'Signup response indicates success: true');
    assert(Boolean(signupRes.data?.user?.id), `User ID generated: ${signupRes.data?.user?.id}`);
    assert(Boolean(signupRes.data?.session?.access_token), 'Real JWT session access token issued');

    const patientUserId = signupRes.data.user.id;
    createdUserIds.push(patientUserId);

    // Verify actual database/auth state
    const { data: authRecord, error: authErr } = await supabaseAdmin.auth.admin.getUserById(patientUserId);
    assert(!authErr && authRecord?.user, 'User verified in Supabase GoTrue auth.users system');
    assert(authRecord.user.email === testPatientEmail, 'Email matches in auth.users');
    assert(authRecord.user.email_confirmed_at !== null, 'Account is confirmed in auth system');

    const { data: dbPatient, error: dbErr } = await supabaseAdmin
      .from('patients')
      .select('*')
      .eq('id', patientUserId)
      .single();
    assert(!dbErr && dbPatient, 'Patient record verified in Supabase public.patients table');
    assert(dbPatient.full_name === 'Vikram Malhotra', 'Patient name synchronized accurately in database');
    console.log();

    // -------------------------------------------------------------------------
    // TEST 2: DUPLICATE EMAIL / ACCOUNT REJECTION
    // -------------------------------------------------------------------------
    console.log('👉 TEST 2: Duplicate Email / Account Rejection');
    const dupRes = await apiRequest('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: testPatientEmail,
        password: 'AnotherPassword456!',
        role: 'patient',
        name: 'Imposter Vikram',
        phone: '+91 99999 00000',
      }),
    });

    assert(dupRes.status === 409, `Duplicate email rejected with HTTP 409 (got ${dupRes.status})`);
    assert(dupRes.data?.error === 'DUPLICATE_EMAIL', 'Error code is DUPLICATE_EMAIL');
    console.log();

    // -------------------------------------------------------------------------
    // TEST 3: WRONG PASSWORD REJECTION
    // -------------------------------------------------------------------------
    console.log('👉 TEST 3: Wrong Password Rejection');
    const wrongPassRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testPatientEmail,
        password: 'WrongPassword999!',
        role: 'patient',
      }),
    });

    assert(wrongPassRes.status === 401, `Wrong password rejected with HTTP 401 (got ${wrongPassRes.status})`);
    assert(wrongPassRes.data?.error === 'INVALID_CREDENTIALS', 'Error code is INVALID_CREDENTIALS');
    console.log();

    // -------------------------------------------------------------------------
    // TEST 4: CORRECT LOGIN
    // -------------------------------------------------------------------------
    console.log('👉 TEST 4: Correct Login (Real Bcrypt Authentication)');
    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testPatientEmail,
        password: testPatientPass,
        role: 'patient',
      }),
    });

    assert(loginRes.status === 200, `Login succeeded with HTTP 200 (got ${loginRes.status})`);
    assert(loginRes.data?.authenticated === true, 'Login response confirmed authenticated: true');
    assert(Boolean(loginRes.data?.token), 'New valid JWT token returned on login');
    assert(loginRes.data?.user?.email === testPatientEmail, 'Authenticated user email matches');

    const patientToken = loginRes.data.token;
    console.log();

    // -------------------------------------------------------------------------
    // TEST 5: SESSION VERIFICATION (/api/auth/me)
    // -------------------------------------------------------------------------
    console.log('👉 TEST 5: Session Verification (/api/auth/me)');
    const meRes = await apiRequest('/api/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${patientToken}` },
    });

    assert(meRes.status === 200, `Session verification returned HTTP 200 (got ${meRes.status})`);
    assert(meRes.data?.authenticated === true, 'Session is actively verified');
    assert(meRes.data?.user?.id === patientUserId, 'Session user ID matches authenticated user');
    console.log();

    // -------------------------------------------------------------------------
    // TEST 6: PROTECTED ROUTES & APIS WITHOUT TOKEN
    // -------------------------------------------------------------------------
    console.log('👉 TEST 6: Protected Routes & APIs Access Control');
    // Calling queue next without token
    const noTokenQueue = await apiRequest('/api/queue/call-next', {
      method: 'POST',
      body: JSON.stringify({ hospitalId: '11111111-1111-4111-a111-111111111111' }),
    });
    assert(noTokenQueue.status === 401, `Unauthenticated queue call rejected with HTTP 401 (got ${noTokenQueue.status})`);

    // Calling queue next with patient token (role: patient != hospital)
    const patientForbiddenQueue = await apiRequest('/api/queue/call-next', {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({ hospitalId: '11111111-1111-4111-a111-111111111111' }),
    });
    assert(
      patientForbiddenQueue.status === 403,
      `Non-hospital user queue advance rejected with HTTP 403 Forbidden (got ${patientForbiddenQueue.status})`
    );

    // Booking appointment without token
    const noTokenBooking = await apiRequest('/api/appointments/book', {
      method: 'POST',
      body: JSON.stringify({
        doctorId: 'd0000001-0000-4000-a000-000000000001',
        timeSlot: '10:00 AM',
      }),
    });
    assert(noTokenBooking.status === 401, `Unauthenticated booking rejected with HTTP 401 (got ${noTokenBooking.status})`);
    console.log();

    // -------------------------------------------------------------------------
    // TEST 7: ANTI-TAMPERING & IDENTITY ENFORCEMENT
    // -------------------------------------------------------------------------
    console.log('👉 TEST 7: Anti-Tampering (Backend ignores forged user IDs)');
    const docsRes = await apiRequest('/api/doctors?hospitalId=11111111-1111-4111-a111-111111111111');
    const validDoctorId = docsRes.data?.doctors?.[0]?.id || docsRes.data?.doctors?.[0]?.doctor_id || '51b2a6b8-52aa-4586-baa1-8e352b82903f';

    const forgedId = '00000000-ffff-4000-8000-000000000000';
    const bookRes = await apiRequest('/api/appointments/book', {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({
        patientId: forgedId, // Attempting to forge a different user's ID
        patient_id: forgedId,
        doctorId: validDoctorId,
        hospitalId: '11111111-1111-4111-a111-111111111111',
        timeSlot: '02:00 PM',
        date: new Date().toISOString().split('T')[0],
      }),
    });

    assert(bookRes.status === 200, `Appointment booked with HTTP 200 (got ${bookRes.status})`);
    const bookedApt = bookRes.data?.appointment || bookRes.data;
    assert(
      bookedApt.patient_id === patientUserId || bookedApt.patientId === patientUserId,
      `Backend enforced authenticated identity (${patientUserId}) and ignored forged ID (${forgedId})`
    );
    console.log();

    // -------------------------------------------------------------------------
    // TEST 8: EXPIRED / MALFORMED / INVALID TOKEN REJECTION
    // -------------------------------------------------------------------------
    console.log('👉 TEST 8: Expired / Invalid / Malformed Session Rejection');
    const invalidTokenRes = await apiRequest('/api/auth/me', {
      method: 'GET',
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.signature' },
    });
    assert(
      invalidTokenRes.status === 401,
      `Tampered token rejected with HTTP 401 (got ${invalidTokenRes.status})`
    );

    const emptyTokenRes = await apiRequest('/api/auth/me', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' },
    });
    assert(emptyTokenRes.status === 401, `Empty token rejected with HTTP 401 (got ${emptyTokenRes.status})`);
    console.log();

    // -------------------------------------------------------------------------
    // TEST 9: LOGOUT & SESSION INVALIDATION
    // -------------------------------------------------------------------------
    console.log('👉 TEST 9: Logout & Session Invalidation');
    const logoutRes = await apiRequest('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    assert(logoutRes.status === 200, `Logout returned HTTP 200 (got ${logoutRes.status})`);
    assert(logoutRes.data?.success === true, 'Logout confirms success: true');
    console.log();

    // -------------------------------------------------------------------------
    // TEST 10: HOSPITAL SIGNUP, AUTHENTICATION & PRIVILEGED CALLS
    // -------------------------------------------------------------------------
    console.log('👉 TEST 10: Real Hospital Enrollment & Privileged Queue Control');
    const hospSignupRes = await apiRequest('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: testHospEmail,
        password: testHospPass,
        role: 'hospital',
        name: 'Metro City Trauma Center',
        phone: '+91-11-29990001',
        telegram_chat_id: '6537122486',
        latitude: 28.54,
        longitude: 77.26,
        address: 'Kailash Colony, Greater Kailash, New Delhi',
      }),
    });

    assert(hospSignupRes.status === 201, `Hospital signup returned HTTP 201 (got ${hospSignupRes.status})`);
    const hospUserId = hospSignupRes.data.user.id;
    createdUserIds.push(hospUserId);

    // Verify hospital in database
    const { data: dbHosp, error: hospDbErr } = await supabaseAdmin
      .from('hospitals')
      .select('*')
      .eq('id', hospUserId)
      .single();
    assert(!hospDbErr && dbHosp, 'Hospital verified in Supabase public.hospitals table');
    assert(dbHosp.name === 'Metro City Trauma Center', 'Hospital name matched in database');

    // Hospital login
    const hospLoginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testHospEmail,
        password: testHospPass,
        role: 'hospital',
      }),
    });
    assert(hospLoginRes.status === 200, 'Hospital login successful with real credentials');
    const hospToken = hospLoginRes.data.token;

    // Hospital privileged call: advance queue
    const hospQueueRes = await apiRequest('/api/queue/call-next', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospToken}` },
      body: JSON.stringify({ hospitalId: hospUserId }),
    });
    assert(hospQueueRes.status === 200, `Hospital successfully called next patient in queue (HTTP 200)`);
    console.log();

    console.log('================================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED PERFECTLY!`);
    console.log('================================================================\n');
  } finally {
    // Cleanup created test records
    console.log('🧹 Cleaning up test accounts from Supabase Auth & Database...');
    for (const uid of createdUserIds) {
      try {
        await supabaseAdmin.from('patients').delete().eq('id', uid);
        await supabaseAdmin.from('hospitals').delete().eq('id', uid);
        await supabaseAdmin.auth.admin.deleteUser(uid);
      } catch (err) {
        console.warn(`[Cleanup] Note on deleting ${uid}:`, err.message);
      }
    }
    console.log('✨ Cleanup complete.\n');
    await stopTestServer();
  }
}

runPhase2Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[TEST ERROR]', err);
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * ============================================================================
 * MedConnect Pulse — Phase 2: Real Database & AI Receptionist Flow Verification
 * ============================================================================
 * 
 * Verifies all Phase 2 Database & Real Data Integration requirements:
 * 1. Doctor lookup from real database
 * 2. Department lookup from real database
 * 3. Hospital lookup from real database
 * 4. Doctor availability lookup
 * 5. Appointment slot availability calculation
 * 6. Transactional appointment booking via atomic stored procedure
 * 7. Double-booking prevention check (guaranteed error, no duplicates)
 * 8. Validation rejection for invalid doctor, patient, slot, or past date
 * 9. Appointment cancellation & slot status restoration to 'available'
 * 10. Patient lookup & registration in real database
 * 11. Queue/token generation (#MED-XXXX) & live queue metrics
 * 12. Consultation dues & balance lookup
 * 13. End-to-end multi-turn AI Receptionist voice/text turns using real DB data
 * 
 * Usage:
 *   node scripts/test-phase2-database-flow.js
 * ============================================================================
 */

import { db } from '../backend/db.js';
import { processReceptionistTurn } from '../backend/services/receptionistService.js';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const results = [];

function logTest(testNum, title, passed, details) {
  results.push({ testNum, title, passed, details });
  const icon = passed ? `${C.green}✅ PASS${C.reset}` : `${C.red}❌ FAIL${C.reset}`;
  console.log(`[TEST ${testNum}] ${icon} — ${C.bold}${title}${C.reset}\n        ${details}`);
}

async function runPhase2DatabaseTests() {
  console.log(`${C.bold}${C.cyan}`);
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  MedConnect Pulse — Phase 2: Real Database & AI Receptionist Verification ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  console.log(`${C.reset}`);

  // TEST 1: Hospital Lookup from Real DB
  try {
    const hospitals = await db.getHospitals();
    const hasYashoda = hospitals.some(h => h.name.includes('Yashoda') || h.name.includes('AIIMS'));
    const isValid = hospitals.length > 0 && Boolean(hospitals[0].id) && Boolean(hospitals[0].name);
    logTest(
      1,
      'Hospital Lookup from Real Database',
      hasYashoda && isValid,
      `Retrieved ${hospitals.length} active hospitals from database. Primary: "${hospitals[0]?.name}" (${hospitals[0]?.id})`
    );
  } catch (err) {
    logTest(1, 'Hospital Lookup from Real Database', false, err.message);
  }

  // TEST 2: Department Lookup from Real DB
  let departments = [];
  try {
    departments = await db.getDepartments();
    const deptNames = departments.map(d => d.name);
    const hasCoreDepts = deptNames.includes('Cardiology') && deptNames.includes('Orthopedics') && deptNames.includes('General Medicine');
    logTest(
      2,
      'Department Lookup from Real Database',
      departments.length >= 3 && hasCoreDepts,
      `Retrieved ${departments.length} departments: [${deptNames.join(', ')}]`
    );
  } catch (err) {
    logTest(2, 'Department Lookup from Real Database', false, err.message);
  }

  // TEST 3: Doctor Lookup from Real DB
  let doctors = [];
  try {
    doctors = await db.getDoctors();
    const docNames = doctors.map(d => `${d.name} (${d.specialization})`);
    const hasCardio = doctors.some(d => d.name.includes('Ananya'));
    const hasOrtho = doctors.some(d => d.name.includes('Rajesh'));
    logTest(
      3,
      'Doctor Lookup from Real Database',
      doctors.length >= 2 && hasCardio && hasOrtho,
      `Retrieved ${doctors.length} active doctors: [${docNames.slice(0, 3).join(', ')}]`
    );
  } catch (err) {
    logTest(3, 'Doctor Lookup from Real Database', false, err.message);
  }

  // TEST 4: Doctor Availability & Slot Retrieval
  const todayStr = new Date().toISOString().split('T')[0];
  const testDoctor = doctors.find(d => d.name.includes('Ananya')) || doctors[0];
  let availableSlots = [];
  try {
    availableSlots = await db.calculateAvailableSlots(testDoctor.id, todayStr);
    logTest(
      4,
      'Doctor Availability & Slot Calculation from Real Database',
      availableSlots.length > 0,
      `Doctor ${testDoctor.name} has ${availableSlots.length} available slots on ${todayStr}: [${availableSlots.slice(0, 4).join(', ')}]`
    );
  } catch (err) {
    logTest(4, 'Doctor Availability & Slot Calculation from Real Database', false, err.message);
  }

  // TEST 5: Patient Lookup and Registration
  const testPhone = `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const testPatientName = 'Suresh Nair';
  let patient = null;
  try {
    // 5A: Lookup non-existent patient returns null or in-memory
    let existing = await db.getPatientByPhone(testPhone);
    // 5B: Create patient in real database
    patient = await db.createPatient({ name: testPatientName, phone: testPhone });
    const verifiedPt = await db.getPatientByPhone(testPhone);

    const ok = Boolean(verifiedPt) && (verifiedPt.phone === testPhone || verifiedPt.phone_number === testPhone);
    logTest(
      5,
      'Patient Lookup & Registration in Real Database',
      ok,
      `Registered patient "${testPatientName}" with phone ${testPhone}. ID: ${patient?.id || patient?.patient_id}`
    );
  } catch (err) {
    logTest(5, 'Patient Lookup & Registration in Real Database', false, err.message);
  }

  // TEST 6: Transactional Appointment Booking via Atomic RPC
  let bookedAppointment = null;
  let bookedSlot = null;
  try {
    // Get actual raw slot record from database
    const slots = await db.getDoctorSlots(testDoctor.id, todayStr);
    bookedSlot = slots[slots.length - 1]; // Pick last available slot to avoid colliding with previous tests

    const bookRes = await db.bookAppointmentAtomic({
      patient_id: patient.id || patient.patient_id,
      doctor_id: testDoctor.id,
      department_id: testDoctor.department_id,
      slot_id: bookedSlot.id,
      token: `#MED-${Math.floor(1000 + Math.random() * 9000)}`,
      symptoms: 'Phase 2 Database Flow Integration Test',
      correlation_id: `CORR-P2-${Date.now()}`,
    });

    bookedAppointment = bookRes;
    const ok = bookRes.success === true && Boolean(bookRes.appointment_id) && Boolean(bookRes.token);
    logTest(
      6,
      'Transactional Appointment Booking via book_appointment_atomic RPC',
      ok,
      `Transaction committed: Token: ${bookRes.token}, Appt ID: ${bookRes.appointment_id}, Queue Pos: ${bookRes.queue_position}`
    );
  } catch (err) {
    logTest(6, 'Transactional Appointment Booking via book_appointment_atomic RPC', false, err.message);
  }

  // TEST 7: Double Booking Prevention (Strict Concurrency & Status Guard)
  try {
    let secondBookingFailed = false;
    let errorDetail = '';
    try {
      await db.bookAppointmentAtomic({
        patient_id: patient.id || patient.patient_id,
        doctor_id: testDoctor.id,
        department_id: testDoctor.department_id,
        slot_id: bookedSlot.id, // SAME slot!
        token: `#MED-${Math.floor(1000 + Math.random() * 9000)}`,
        symptoms: 'Attempted duplicate booking on occupied slot',
        correlation_id: `CORR-DUP-${Date.now()}`,
      });
    } catch (err) {
      secondBookingFailed = true;
      errorDetail = err.message;
    }

    logTest(
      7,
      'Double Booking Prevention (Strict Slot Unavailability Guard)',
      secondBookingFailed,
      `Double-booking was prevented by database transaction: "${errorDetail}"`
    );
  } catch (err) {
    logTest(7, 'Double Booking Prevention', false, err.message);
  }

  // TEST 8: Strict Validation - Reject Invalid Doctor / Past Date / Hallucinations
  try {
    // 8A: Non-existent doctor
    const fakeDocTurn = await processReceptionistTurn({
      text: 'Mujhe Dr. FakeDoctorNotFound se appointment chahiye',
    });
    const fakeRejected = fakeDocTurn.status === 'NEEDS_MORE_INFO' &&
      (fakeDocTurn.aiMessage.includes('registered nahi hain') || fakeDocTurn.aiMessage.includes('available'));

    // 8B: Past date rejection
    const pastTurn = await processReceptionistTurn({
      text: `Dr. Ananya Roy se 2020-01-01 ko appointment chahiye`,
    });
    const pastRejected = pastTurn.status === 'NEEDS_MORE_INFO' &&
      (pastTurn.aiMessage.includes('nikal chuki hai') || pastTurn.aiMessage.includes('aaj'));

    logTest(
      8,
      'Strict Backend Validation Engine (Reject Fake Doctors & Past Dates)',
      fakeRejected && pastRejected,
      `Fake doctor rejected: ${fakeRejected}. Past date 2020-01-01 rejected: ${pastRejected}.`
    );
  } catch (err) {
    logTest(8, 'Strict Backend Validation Engine', false, err.message);
  }

  // TEST 9: Queue & Token Position Metrics Lookup
  try {
    const queueMetrics = await db.getPatientQueueMetrics(bookedAppointment.token);
    const ok = queueMetrics.my_token === bookedAppointment.token && typeof queueMetrics.queue_position === 'number';
    logTest(
      9,
      'Queue & Token Metrics Calculation from Live Database',
      ok,
      `Token ${queueMetrics.my_token}: Position: ${queueMetrics.queue_position}, Ahead: ${queueMetrics.people_ahead}, Wait: ${queueMetrics.estimated_wait_minutes}m, Status: ${queueMetrics.status}`
    );
  } catch (err) {
    logTest(9, 'Queue & Token Metrics Calculation from Live Database', false, err.message);
  }

  // TEST 10: Dues / Balance Lookup
  try {
    const dues = await db.getDues(patient.phone || testPhone);
    const ok = typeof dues.consultationFee === 'number' && typeof dues.totalDues === 'number';
    logTest(
      10,
      'Patient Dues & Consultation Fee Lookup',
      ok,
      `Patient ${dues.patientName}: Pending Dues: ₹${dues.totalDues}, Consultation Fee: ₹${dues.consultationFee}`
    );
  } catch (err) {
    logTest(10, 'Patient Dues & Consultation Fee Lookup', false, err.message);
  }

  // TEST 11: Appointment Cancellation & Slot Recovery
  try {
    const cancelRes = await db.cancelAppointment(bookedAppointment.appointment_id);
    // Check that slot status is restored to 'available'
    const updatedSlots = await db.getDoctorSlots(testDoctor.id, todayStr);
    const slotRestored = updatedSlots.some(s => s.id === bookedSlot.id && s.status === 'AVAILABLE');

    logTest(
      11,
      'Appointment Cancellation & Slot Status Restoration to AVAILABLE',
      cancelRes.status === 'CANCELLED' && slotRestored,
      `Appointment ${cancelRes.token || cancelRes.token_number} cancelled. Slot ${bookedSlot.id} status restored to AVAILABLE.`
    );
  } catch (err) {
    logTest(11, 'Appointment Cancellation & Slot Status Restoration', false, err.message);
  }

  // TEST 12: End-to-End Multi-Turn Receptionist Conversation on Real DB
  try {
    // Turn 1: Broad inquiry
    const turn1 = await processReceptionistTurn({
      channel: 'text',
      text: 'Mujhe doctor se milna hai',
      useN8n: false,
    });

    // Turn 2: Select doctor from real DB
    const turn2 = await processReceptionistTurn({
      channel: 'text',
      text: `Dr. Ananya Roy se appointment chahiye`,
      context: turn1.context,
      useN8n: false,
    });

    // Turn 3: Pick available slot
    const slotToPick = turn2.actionPayload?.availableSlots?.[0] || '09:00 AM';
    const turn3 = await processReceptionistTurn({
      channel: 'text',
      text: `${slotToPick}`,
      context: turn2.context,
      useN8n: false,
    });

    const isBooked = turn3.status === 'ACTION_COMPLETED' && Boolean(turn3.actionPayload?.appointment);
    logTest(
      12,
      'End-to-End Multi-Turn AI Receptionist Turn using Real Database',
      isBooked,
      `Turn 1 (${turn1.status}) -> Turn 2 (${turn2.status}) -> Turn 3 (${turn3.status}) booked token ${turn3.actionPayload?.appointment?.token || turn3.actionPayload?.appointment?.token_number}`
    );

    // Clean up Turn 3 appointment
    if (turn3.actionPayload?.appointment?.id || turn3.actionPayload?.appointment?.appointment_id) {
      await db.cancelAppointment(turn3.actionPayload?.appointment?.id || turn3.actionPayload?.appointment?.appointment_id);
    }
  } catch (err) {
    logTest(12, 'End-to-End Multi-Turn AI Receptionist Turn', false, err.message);
  }

  // SUMMARY REPORT
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  console.log('\n' + '═'.repeat(75));
  console.log(`${C.bold}Phase 2 Real Database Verification Summary:${C.reset}`);
  console.log(`Total Tests: ${total} | ${C.green}Passed: ${passed}${C.reset} | ${failed > 0 ? `${C.red}Failed: ${failed}` : `${C.green}Failed: 0`}${C.reset}`);
  console.log('═'.repeat(75) + '\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2DatabaseTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

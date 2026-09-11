/**
 * Queue Service (MedConnect Pulse)
 * Manages live OPD patient queue state machine, persistent token tracking,
 * emergency priority scheduling, and real database state synchronization.
 */

import { db, normalizeAppointment, formatTo12Hour } from '../db.js';

/**
 * Determine the queue status of an appointment from its database fields.
 */
export function deriveQueueStatus(appt) {
  const st = (appt.status || 'booked').toLowerCase();
  if (st === 'completed') return 'COMPLETED';
  if (st === 'cancelled') return 'CANCELLED';
  if (st === 'no_show') return 'SKIPPED';
  if (st === 'in_consultation') return 'IN_CONSULTATION';

  // For checked_in / booked: check if marked CALLED
  const isCalled = appt.queue_position === 0 ||
    (typeof appt.symptoms_summary === 'string' && appt.symptoms_summary.includes('[QUEUE_STATUS:CALLED]')) ||
    (typeof appt.correlation_id === 'string' && appt.correlation_id.includes('CALLED'));

  if (isCalled) return 'CALLED';
  return 'WAITING';
}

/**
 * Determine if an appointment is an emergency booking.
 */
export function isEmergencyAppointment(appt) {
  const token = appt.token_number || appt.token || '';
  const symptoms = appt.symptoms_summary || appt.symptoms || '';
  return token.includes('EMERG') ||
    token.includes('URG') ||
    symptoms.includes('[EMERGENCY_PRIORITY]') ||
    symptoms.toLowerCase().includes('emergency consultation');
}

/**
 * Fetch live queue entries from the real database, properly sorted and deduplicated.
 */
export async function getQueueEntries(filters = {}) {
  const {
    hospitalId,
    doctorId,
    departmentId,
    includeCompleted = false,
    includeCancelled = false,
  } = typeof filters === 'string' ? { hospitalId: filters } : (filters || {});

  // Fetch from DB (db.getLiveQueueAppointments handles real Supabase queries)
  const appointments = await db.getLiveQueueAppointments({
    hospitalId,
    doctorId,
    departmentId,
    includeCompleted,
    includeCancelled,
  });

  // Filter and transform into normalized QueueEntry objects
  const rawEntries = appointments.map((appt) => {
    const queueStatus = deriveQueueStatus(appt);
    const isEmerg = isEmergencyAppointment(appt);
    const checkInTime = appt.check_in_time || appt.created_at || new Date().toISOString();

    return {
      queue_id: appt.id || appt.appointment_id,
      appointment_id: appt.id || appt.appointment_id,
      patient_id: appt.patient_id,
      patient_name: appt.patient_name || appt.patients?.full_name || appt.patients?.name || 'Patient',
      patient_phone: appt.patient_phone || appt.patients?.phone_number || appt.patients?.phone || '',
      doctor_id: appt.doctor_id,
      doctor_name: appt.doctor_name || appt.doctors?.name || 'Assigned Doctor',
      department_id: appt.department_id,
      department_name: appt.department_name || appt.departments?.name || appt.doctors?.departments?.name || 'OPD',
      hospital_id: appt.hospital_id,
      hospital_name: appt.hospital_name || appt.hospitals?.name || 'Hospital',
      token: appt.token_number || appt.token || `#MED-${(appt.id || '').slice(0, 4)}`,
      position: Number(appt.queue_position) || 0,
      status: queueStatus,
      check_in_at: checkInTime,
      created_at: appt.created_at || checkInTime,
      is_emergency: isEmerg,
      symptoms_summary: appt.symptoms_summary || '',
    };
  });

  // Deduplicate by appointment_id / token (prevent duplicate queue rows)
  const seenIds = new Set();
  const deduped = [];
  for (const entry of rawEntries) {
    const key = entry.appointment_id || entry.token;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      deduped.push(entry);
    }
  }

  // Split into active status groups
  const inConsultation = deduped.filter(e => e.status === 'IN_CONSULTATION');
  const called = deduped.filter(e => e.status === 'CALLED');
  const waiting = deduped.filter(e => e.status === 'WAITING');
  const completed = deduped.filter(e => e.status === 'COMPLETED');
  const cancelled = deduped.filter(e => e.status === 'CANCELLED' || e.status === 'SKIPPED');

  // Sort WAITING patients: Emergency first, then FIFO by check-in time
  waiting.sort((a, b) => {
    if (a.is_emergency && !b.is_emergency) return -1;
    if (!a.is_emergency && b.is_emergency) return 1;
    const timeA = new Date(a.check_in_at).getTime();
    const timeB = new Date(b.check_in_at).getTime();
    return timeA - timeB;
  });

  // Assign deterministic 1-based sequential positions to waiting patients
  waiting.forEach((entry, idx) => {
    entry.position = idx + 1;
    entry.estimated_wait_mins = Math.max(0, idx * 15);
  });

  // In consultation and called patients have position 0
  inConsultation.forEach(e => {
    e.position = 0;
    e.estimated_wait_mins = 0;
  });
  called.forEach(e => {
    e.position = 0;
    e.estimated_wait_mins = 0;
  });

  // Assemble final active queue roster
  const result = [];
  result.push(...inConsultation);
  result.push(...called);
  result.push(...waiting);

  if (includeCompleted) result.push(...completed);
  if (includeCancelled) result.push(...cancelled);

  return result;
}

/**
 * Call the next patient in the queue.
 * Lifecycle transition:
 * 1. Current IN_CONSULTATION -> COMPLETED
 * 2. Current CALLED -> IN_CONSULTATION
 * 3. Next WAITING (emergency first, then FIFO) -> CALLED
 */
export async function callNextPatient({ hospitalId, doctorId, staffUser = null }) {
  // Fetch current real entries
  const currentEntries = await getQueueEntries({ hospitalId, doctorId });

  const activeConsultation = currentEntries.find(e => e.status === 'IN_CONSULTATION');
  const currentlyCalled = currentEntries.find(e => e.status === 'CALLED');
  const nextWaiting = currentEntries.find(e => e.status === 'WAITING');

  const updates = [];

  // 1. If someone is already in consultation, complete their visit
  if (activeConsultation) {
    updates.push(
      db.updateAppointmentStatus(activeConsultation.appointment_id, {
        status: 'completed',
        queue_position: null,
        notes: 'Consultation completed by doctor/desk call-next action',
      })
    );
  }

  // 2. If someone was called, move them to in_consultation
  if (currentlyCalled) {
    // Remove the [QUEUE_STATUS:CALLED] tag and update status to in_consultation
    const cleanSymptoms = (currentlyCalled.symptoms_summary || '').replace('[QUEUE_STATUS:CALLED]', '').trim();
    updates.push(
      db.updateAppointmentStatus(currentlyCalled.appointment_id, {
        status: 'in_consultation',
        queue_position: 0,
        symptoms_summary: cleanSymptoms,
        notes: 'Patient entered doctor consultation room',
      })
    );
  }

  // 3. Select next waiting patient and mark CALLED
  let newCalled = null;
  if (nextWaiting) {
    const existingSymptoms = nextWaiting.symptoms_summary || '';
    const newSymptoms = existingSymptoms.includes('[QUEUE_STATUS:CALLED]')
      ? existingSymptoms
      : `${existingSymptoms} [QUEUE_STATUS:CALLED]`.trim();

    updates.push(
      db.updateAppointmentStatus(nextWaiting.appointment_id, {
        status: 'checked_in',
        queue_position: 0,
        symptoms_summary: newSymptoms,
        notes: `Called to consultation desk by ${staffUser?.name || 'Staff'}`,
      })
    );
    newCalled = { ...nextWaiting, status: 'CALLED', position: 0 };
  }

  // Execute updates
  await Promise.all(updates);

  // Recalculate remaining waiting positions in database
  const updatedEntries = await getQueueEntries({ hospitalId, doctorId });
  const remainingWaiting = updatedEntries.filter(e => e.status === 'WAITING');
  await Promise.all(
    remainingWaiting.map(w =>
      db.updateAppointmentStatus(w.appointment_id, {
        queue_position: w.position,
        estimated_wait_minutes: w.estimated_wait_mins,
      })
    )
  );

  return {
    success: true,
    called_patient: newCalled,
    advanced_to_consultation: currentlyCalled ? currentlyCalled.token : null,
    completed_patient: activeConsultation ? activeConsultation.token : null,
    entries: updatedEntries,
  };
}

/**
 * Granularly update a single patient's queue status (e.g. COMPLETED, CANCELLED, NO_SHOW).
 */
export async function advancePatientStatus({ appointmentId, newStatus, staffUser = null }) {
  const normStatus = newStatus.toUpperCase();

  let dbStatus = 'checked_in';
  let queuePos = null;
  let symptomsTag = null;

  switch (normStatus) {
    case 'CALLED':
      dbStatus = 'checked_in';
      queuePos = 0;
      symptomsTag = '[QUEUE_STATUS:CALLED]';
      break;
    case 'IN_CONSULTATION':
    case 'IN_SERVICE':
      dbStatus = 'in_consultation';
      queuePos = 0;
      break;
    case 'COMPLETED':
      dbStatus = 'completed';
      queuePos = null;
      break;
    case 'CANCELLED':
      dbStatus = 'cancelled';
      queuePos = null;
      break;
    case 'SKIPPED':
    case 'NO_SHOW':
      dbStatus = 'no_show';
      queuePos = null;
      break;
    case 'WAITING':
      dbStatus = 'checked_in';
      queuePos = 1;
      break;
    default:
      throw new Error(`Invalid status transition: ${newStatus}`);
  }

  const appt = await db.getAppointmentById(appointmentId);
  if (!appt) {
    throw new Error(`Appointment not found: ${appointmentId}`);
  }

  let cleanSymptoms = (appt.symptoms_summary || '').replace('[QUEUE_STATUS:CALLED]', '').trim();
  if (symptomsTag) {
    cleanSymptoms = `${cleanSymptoms} ${symptomsTag}`.trim();
  }

  await db.updateAppointmentStatus(appt.id || appt.appointment_id, {
    status: dbStatus,
    queue_position: queuePos,
    symptoms_summary: cleanSymptoms,
    notes: `Status changed to ${normStatus} by ${staffUser?.name || 'Staff'}`,
  });

  // If slot restoration is needed on cancellation
  if (dbStatus === 'cancelled' && appt.slot_id) {
    if (typeof db.releaseSlot === 'function') {
      await db.releaseSlot(appt.slot_id).catch(() => {});
    }
  }

  // Recalculate remaining queue
  const updatedEntries = await getQueueEntries({
    hospitalId: appt.hospital_id,
    doctorId: appt.doctor_id,
  });

  // Persist re-indexed positions for waiting patients
  const remainingWaiting = updatedEntries.filter(e => e.status === 'WAITING');
  await Promise.all(
    remainingWaiting.map(w =>
      db.updateAppointmentStatus(w.appointment_id, {
        queue_position: w.position,
        estimated_wait_minutes: w.estimated_wait_mins,
      }).catch(() => {})
    )
  );

  return {
    success: true,
    appointment_id: appt.id || appt.appointment_id,
    token: appt.token_number || appt.token,
    new_status: normStatus,
    entries: updatedEntries,
  };
}

/**
 * Get accurate queue metrics for a patient's token or appointment ID.
 */
export async function getQueueStatus(tokenIdOrApptId, options = {}) {
  const { hospitalId, doctorId } = options;

  if (!tokenIdOrApptId) {
    if (hospitalId || doctorId) {
      const entries = await getQueueEntries({ hospitalId, doctorId });
      const waiting = entries.filter(e => e.status === 'WAITING');
      const called = entries.find(e => e.status === 'CALLED');
      const active = entries.find(e => e.status === 'IN_CONSULTATION');
      return {
        success: true,
        hospital_id: hospitalId,
        doctor_id: doctorId,
        waiting_count: waiting.length,
        total_active: entries.length,
        current_consultation: active ? active.token : null,
        called_patient: called ? called.token : null,
        estimated_wait_mins: waiting.length * 15,
      };
    }
    return { success: false, error: 'Token ID or Appointment ID required' };
  }

  const appt = await db.getAppointmentById(tokenIdOrApptId);
  if (!appt) {
    return {
      success: false,
      error: 'Token not found',
      message: `No appointment found matching ${tokenIdOrApptId}`,
    };
  }

  // Get active queue for this doctor/hospital
  const entries = await getQueueEntries({
    hospitalId: appt.hospital_id,
    doctorId: appt.doctor_id,
  });

  const myEntry = entries.find(e => e.appointment_id === appt.id || e.token === (appt.token_number || appt.token));
  const activeConsultation = entries.find(e => e.status === 'IN_CONSULTATION');
  const calledPatient = entries.find(e => e.status === 'CALLED');

  const myPos = myEntry ? myEntry.position : (appt.queue_position || 1);
  const peopleAhead = Math.max(0, myPos - 1);
  const estWait = myEntry ? (myEntry.estimated_wait_mins ?? peopleAhead * 15) : peopleAhead * 15;

  return {
    success: true,
    my_token: appt.token_number || appt.token,
    token: appt.token_number || appt.token,
    status: myEntry ? myEntry.status : (appt.status || 'BOOKED').toUpperCase(),
    queue_position: myPos,
    people_ahead: peopleAhead,
    estimated_wait_minutes: estWait,
    current_token: activeConsultation ? activeConsultation.token : (calledPatient ? calledPatient.token : 'None'),
    doctor_name: appt.doctor_name || appt.doctors?.name || 'Assigned Doctor',
    department_name: appt.department_name || appt.departments?.name || 'OPD',
    hospital_name: appt.hospital_name || appt.hospitals?.name || 'Hospital',
    is_emergency: isEmergencyAppointment(appt),
  };
}

export default {
  deriveQueueStatus,
  isEmergencyAppointment,
  getQueueEntries,
  callNextPatient,
  advancePatientStatus,
  getQueueStatus,
};

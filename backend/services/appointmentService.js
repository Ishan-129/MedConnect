/**
 * Appointment Service (MedConnect Pulse)
 * Handles slot calculations, atomic booking via book_appointment_atomic RPC,
 * cancellation, and token lookup.
 */

import { db } from '../db.js';
import { randomUUID } from 'node:crypto';
import { triggerN8nQueueNotification } from './n8nService.js';
import { generateSignedAppointmentQR } from './qrService.js';

export async function calculateAvailableSlots(doctorId, date) {
  return db.calculateAvailableSlots(doctorId, date);
}

export async function getAllDoctorSlots(doctorId, date) {
  return db.getAllDoctorSlots(doctorId, date);
}

// In-memory idempotency deduplication cache (15s TTL)
const recentBookingsCache = new Map();

function cleanOldBookings() {
  const now = Date.now();
  for (const [key, val] of recentBookingsCache.entries()) {
    if (now - val.timestamp > 15000) {
      recentBookingsCache.delete(key);
    }
  }
}

export async function bookAppointment({
  hospitalId,
  departmentId,
  doctorId,
  patientName = 'Patient',
  patientPhone = '+91 98999 12345',
  date,
  timeSlot,
  slotId,
  notes = '',
}) {
  cleanOldBookings();

  // Validate patientPhone
  const cleanPhone = (patientPhone || '').trim();
  if (!cleanPhone) {
    throw new Error('Valid patient phone number is required');
  }

  // Validate date (reject past dates)
  const todayStr = new Date().toISOString().split('T')[0];
  const targetDate = date || todayStr;
  if (targetDate < todayStr) {
    throw new Error('Appointment date cannot be in the past');
  }

  // Idempotency check for rapid duplicate clicks
  const dedupeKey = `${cleanPhone}:${doctorId}:${targetDate}:${slotId || timeSlot || 'any'}`;
  if (recentBookingsCache.has(dedupeKey)) {
    const cached = recentBookingsCache.get(dedupeKey);
    return cached.result;
  }

  // 1. Verify doctor
  const doctor = await db.getDoctorById(doctorId);
  if (!doctor) {
    throw new Error(`Doctor not found: ${doctorId}`);
  }

  const deptId = departmentId || doctor.department_id;
  const hospId = hospitalId || doctor.hospital_id;

  // 2. Find or register patient
  let patient = await db.getPatientByPhone(cleanPhone);
  if (!patient) {
    patient = await db.createPatient({ name: patientName.trim() || 'Patient', phone: cleanPhone });
  }

  // 3. Find and validate targeted slot
  const allSlots = await db.getDoctorSlots(doctorId, targetDate, true);

  let selectedSlot;
  if (slotId) {
    selectedSlot = allSlots.find(s => s.slot_id === slotId || s.id === slotId);
    if (!selectedSlot) {
      throw new Error(`The requested slot ID (${slotId}) was not found.`);
    }
    if ((selectedSlot.status || '').toUpperCase() !== 'AVAILABLE') {
      throw new Error(`The requested time slot (${selectedSlot.display_time || 'selected'}) is already booked. Please choose another slot.`);
    }
  }

  if (!selectedSlot && timeSlot) {
    const norm = timeSlot.toLowerCase().replace(/\s+/g, '');
    const matched = allSlots.find(s =>
      (
        (s.display_time && s.display_time.toLowerCase().replace(/\s+/g, '') === norm) ||
        (s.display_time && s.display_time.toLowerCase().includes(norm)) ||
        (s.start_time && s.start_time.includes(timeSlot))
      )
    );
    if (matched) {
      if ((matched.status || '').toUpperCase() !== 'AVAILABLE') {
        throw new Error(`The requested time slot (${timeSlot}) is already booked. Please choose another slot.`);
      }
      selectedSlot = matched;
    } else {
      throw new Error(`The requested time slot (${timeSlot}) is unavailable.`);
    }
  }

  if (!selectedSlot) {
    selectedSlot = allSlots.find(s => (s.status || '').toUpperCase() === 'AVAILABLE');
  }

  if (!selectedSlot || (selectedSlot.status || '').toUpperCase() !== 'AVAILABLE') {
    throw new Error(`No available appointment slot for ${doctor.name} on ${targetDate}`);
  }

  // 4. Generate token and execute atomic booking
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const token = `#MED-${randomNum}`;

  // 5. Execute atomic booking
  const result = await db.bookAppointmentAtomic({
    patient_id: patient.patient_id,
    patient_name: patient.name || patient.full_name || patientName,
    patient_phone: patient.phone || patient.phone_number || cleanPhone,
    doctor_id: doctor.doctor_id,
    doctor_name: doctor.name,
    department_id: deptId,
    department_name: doctor.department_name,
    slot_id: selectedSlot.slot_id || selectedSlot.id,
    token,
  });

  if (!result.success) {
    throw new Error(result.message || result.error || 'Failed to book appointment slot');
  }

  const apptId = result.appointment?.id || result.appointment_id;
  const actualToken = result.token_number || result.token || result.appointment?.token_number || result.appointment?.token || token;
  const signedQr = generateSignedAppointmentQR({ appointment_id: apptId, token: actualToken });
  const qrRef = signedQr.qrString;

  // Trigger n8n Workflow (MEDCONNECT | WF05 | QUEUE NOTIFICATION)
  triggerN8nQueueNotification({
    appointment_id: apptId,
    patient_id: patient.patient_id,
    patient_name: patient.name || patientName,
    phone_number: patient.phone || patientPhone,
    token_number: actualToken,
    queue_position: 1,
    estimated_wait_minutes: 15,
    doctor_name: doctor.name,
    room_number: doctor.room_number || 'Room 101',
    department: doctor.department_name || deptId || 'General Medicine',
    reminder_stage: 'checked_in',
  }).catch(err => console.error('[n8n] Failed to trigger queue notification:', err.message));

  const finalAppt = result.appointment ? {
    ...result.appointment,
    id: result.appointment.id || apptId,
    appointment_id: result.appointment.appointment_id || result.appointment.id || apptId,
    token: actualToken,
    token_number: actualToken,
  } : {
    appointment_id: apptId,
    id: apptId,
    patient_id: patient.patient_id,
    doctor_id: doctor.doctor_id,
    department_id: deptId,
    slot_id: selectedSlot.slot_id,
    appointment_date: targetDate,
    appointment_time: selectedSlot.display_time || timeSlot || '10:00 AM',
    token: actualToken,
    token_number: actualToken,
    status: 'BOOKED',
  };

  const out = {
    success: true,
    appointment: finalAppt,
    token: {
      token_number: actualToken,
      appointment_id: apptId,
      doctor: doctor.name,
      date: targetDate,
      time: selectedSlot.display_time || timeSlot || '10:00 AM',
      patient: patient.name,
    },
    qr_reference: qrRef,
    qr_code: qrRef,
    qr_data: signedQr.rawPayload,
  };

  recentBookingsCache.set(dedupeKey, { result: out, timestamp: Date.now() });
  return out;
}

export async function bookEmergencyAppointment({
  hospitalId,
  departmentId,
  departmentName,
  department,
  patientName = 'Emergency Patient',
  patientPhone = '+91 98999 12345',
  patientId,
  symptoms = 'Emergency Consultation',
  notes = '',
}) {
  const cleanPhone = (patientPhone || '').trim();
  if (!cleanPhone) {
    throw new Error('Valid patient phone number is required for emergency appointment');
  }

  // 1. Resolve or create patient
  let patient = patientId ? await db.getPatientById(patientId) : null;
  if (!patient) {
    patient = await db.getPatientByPhone(cleanPhone);
  }
  if (!patient) {
    patient = await db.createPatient({ name: patientName.trim() || 'Emergency Patient', phone: cleanPhone });
  }

  const deptName = departmentName || department;

  // 2. Perform atomic emergency reservation
  const result = await db.bookEmergencyAppointmentAtomic({
    patient_id: patient.patient_id || patient.id,
    department_id: departmentId,
    department_name: deptName,
    hospital_id: hospitalId,
    patient_name: patient.name || patientName,
    patient_phone: cleanPhone,
    symptoms: symptoms || notes || 'Emergency Consultation Request',
  });

  if (!result || !result.success) {
    return {
      success: false,
      error: result?.error || 'NO_EMERGENCY_SLOT_AVAILABLE',
      message: result?.message || 'No suitable emergency slot currently available',
      department: result?.department || deptName,
      fallback: result?.fallback || {
        emergency_contact: '102',
        action: 'CONTACT_EMERGENCY_DESK',
        alternate_hospitals_url: '/api/hospitals/nearby',
      },
    };
  }

  // 3. Trigger emergency notifications (n8n & Twilio/voice escalation if critical)
  triggerN8nQueueNotification({
    appointment_id: result.appointment_id || result.appointment?.id,
    patient_id: patient.patient_id || patient.id,
    patient_name: patient.name || patientName,
    phone_number: cleanPhone,
    token_number: result.token,
    queue_position: 1,
    estimated_wait_minutes: 5,
    doctor_name: result.doctor?.name || 'Emergency Doctor',
    room_number: result.doctor?.room_number || 'OPD Emergency Desk',
    department: result.doctor?.department_name || deptName || 'Emergency Specialty',
    reminder_stage: 'emergency_triage',
  }).catch(err => console.error('[n8n] Failed to trigger emergency queue notification:', err.message));

  const finalTokenStr = typeof result.token === 'string'
    ? result.token
    : (typeof result.token_number === 'string'
      ? result.token_number
      : (typeof result.token?.token_number === 'string'
        ? result.token.token_number
        : (typeof result.appointment?.token_number === 'string'
          ? result.appointment.token_number
          : (typeof result.appointment?.token === 'string' ? result.appointment.token : '#EMERG-1001'))));

  return {
    success: true,
    is_emergency: true,
    queue_position: result.queue_position || 1,
    estimated_wait_minutes: result.estimated_wait_minutes || 5,
    appointment: result.appointment || {
      appointment_id: result.appointment_id,
      patient_id: patient.patient_id || patient.id,
      doctor_id: result.doctor?.doctor_id,
      token: finalTokenStr,
      status: 'BOOKED',
      is_emergency: true,
    },
    token: {
      token_number: finalTokenStr,
      appointment_id: result.appointment_id,
      doctor: result.doctor?.name,
      patient: patient.name || patientName,
      department: result.doctor?.department_name || deptName,
      time: result.slot?.display_time || result.slot?.start_time,
      date: result.slot?.date || new Date().toISOString().split('T')[0],
      is_emergency: true,
    },
    token_number: finalTokenStr,
    doctor: result.doctor,
    slot: result.slot,
    hospital: result.hospital,
    selection_rationale: result.selection_rationale,
    qr_reference: result.qr_reference,
    qr_code: result.qr_reference,
    qr_data: result.qr_data,
  };
}

export async function getAppointments(filter = {}) {
  return db.getAppointments(filter);
}

export async function getAppointmentById(appointmentId) {
  return db.getAppointmentById(appointmentId);
}

export async function cancelAppointment(appointmentIdOrToken) {
  return db.cancelAppointment(appointmentIdOrToken);
}

export default {
  calculateAvailableSlots,
  getAllDoctorSlots,
  bookAppointment,
  bookEmergencyAppointment,
  getAppointments,
  getAppointmentById,
  cancelAppointment,
};

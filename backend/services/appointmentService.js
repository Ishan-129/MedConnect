/**
 * Appointment Service (MedConnect Pulse)
 * Handles slot calculations, atomic booking via book_appointment_atomic RPC,
 * cancellation, and token lookup.
 */

import { db } from '../db.js';
import { randomUUID } from 'node:crypto';
import { triggerN8nQueueNotification } from './n8nService.js';

export async function calculateAvailableSlots(doctorId, date) {
  return db.calculateAvailableSlots(doctorId, date);
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
  const dedupeKey = `${cleanPhone}:${doctorId}:${targetDate}:${timeSlot || 'any'}`;
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
  const slots = await db.getDoctorSlots(doctorId, targetDate);

  let selectedSlot;
  if (timeSlot) {
    const norm = timeSlot.toLowerCase().replace(/\s+/g, '');
    selectedSlot = slots.find(s =>
      s.status === 'AVAILABLE' && (
        (s.display_time && s.display_time.toLowerCase().replace(/\s+/g, '') === norm) ||
        (s.display_time && s.display_time.toLowerCase().includes(norm)) ||
        s.start_time.includes(timeSlot)
      )
    );
  }

  if (!selectedSlot) {
    selectedSlot = slots.find(s => s.status === 'AVAILABLE');
  }

  if (!selectedSlot) {
    throw new Error(`No available appointment slot for ${doctor.name} on ${targetDate}`);
  }

  // 4. Generate token and QR pass reference
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const token = `#MED-${randomNum}`;
  const qrRef = `qr_${randomUUID().slice(0, 8)}`;

  // 5. Execute atomic booking
  const result = await db.bookAppointmentAtomic({
    patient_id: patient.patient_id,
    doctor_id: doctor.doctor_id,
    department_id: deptId,
    slot_id: selectedSlot.slot_id,
    token,
    qr_ref: qrRef,
  });

  if (!result.success) {
    throw new Error(result.message || result.error || 'Failed to book appointment slot');
  }

  // Trigger n8n Workflow (MEDCONNECT | WF05 | QUEUE NOTIFICATION)
  triggerN8nQueueNotification({
    appointment_id: result.appointment?.id || result.appointment_id,
    patient_id: patient.patient_id,
    patient_name: patient.name || patientName,
    phone_number: patient.phone || patientPhone,
    token_number: token,
    queue_position: 1,
    estimated_wait_minutes: 15,
    doctor_name: doctor.name,
    room_number: doctor.room_number || 'Room 101',
    department: doctor.department_name || deptId || 'General Medicine',
    reminder_stage: 'checked_in',
  }).catch(err => console.error('[n8n] Failed to trigger queue notification:', err.message));

  const out = {
    success: true,
    appointment: result.appointment || {
      appointment_id: result.appointment_id,
      patient_id: patient.patient_id,
      doctor_id: doctor.doctor_id,
      department_id: deptId,
      slot_id: selectedSlot.slot_id,
      appointment_date: targetDate,
      appointment_time: selectedSlot.display_time || timeSlot || '10:00 AM',
      token,
      status: 'BOOKED',
    },
    token: {
      token_number: token,
      appointment_id: result.appointment_id,
      doctor: doctor.name,
      date: targetDate,
      time: selectedSlot.display_time || timeSlot || '10:00 AM',
      patient: patient.name,
    },
    qr_reference: qrRef,
  };

  recentBookingsCache.set(dedupeKey, { result: out, timestamp: Date.now() });
  return out;
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
  bookAppointment,
  getAppointments,
  getAppointmentById,
  cancelAppointment,
};

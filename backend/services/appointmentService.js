/**
 * Appointment Service (MedConnect Pulse)
 * Handles slot calculations, atomic booking via book_appointment_atomic RPC,
 * cancellation, and token lookup.
 */

import { db } from '../db.js';
import { randomUUID } from 'node:crypto';

export async function calculateAvailableSlots(doctorId, date) {
  return db.calculateAvailableSlots(doctorId, date);
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
  // 1. Verify doctor
  const doctor = await db.getDoctorById(doctorId);
  if (!doctor) {
    throw new Error(`Doctor not found: ${doctorId}`);
  }

  const deptId = departmentId || doctor.department_id;
  const hospId = hospitalId || doctor.hospital_id;

  // 2. Find or register patient
  let patient = await db.getPatientByPhone(patientPhone);
  if (!patient) {
    patient = await db.createPatient({ name: patientName, phone: patientPhone });
  }

  // 3. Find matching slot
  const targetDate = date || new Date().toISOString().split('T')[0];
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

  return {
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

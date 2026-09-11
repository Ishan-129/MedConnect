import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { generateSignedAppointmentQR, generateSignedDispatchQR, verifyQRPayload } from './services/qrService.js';

// Load environment variables if not present
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(path.dirname(new URL(import.meta.url).pathname), '.env'),
  path.resolve(path.dirname(new URL(import.meta.url).pathname), '../.env'),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const value = trimmed.slice(idx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('your-project')) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
  } catch (err) {
    console.warn('[db] Note: Supabase client initialization error, will use in-memory store:', err.message);
  }
}

// Helper: Format 24-hour time "14:30:00" to 12-hour "02:30 PM"
export function formatTo12Hour(timeStr) {
  if (!timeStr) return '';
  if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
  const parts = timeStr.split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours.toString().padStart(2, '0')}:${minutes} ${period}`;
}

// Normalizers for seamless schema mapping between DB snake_case & service expectations
export function normalizeHospital(hosp) {
  if (!hosp) return null;
  const id = hosp.id || hosp.hospital_id;
  const phone = hosp.contact_phone || hosp.phone || hosp.contact;
  return {
    ...hosp,
    hospital_id: id,
    id,
    name: hosp.name,
    latitude: hosp.latitude,
    longitude: hosp.longitude,
    address: hosp.address,
    contact: phone,
    phone,
    contact_phone: phone,
    emergency_contact: hosp.emergency_contact || phone || '102',
    telegram_chat_id: hosp.telegram_chat_id || '6537122486',
    is_active: hosp.is_active ?? hosp.active_status ?? true,
    active_status: hosp.is_active ?? hosp.active_status ?? true,
    verification_status: hosp.verification_status || 'VERIFIED',
    supported_resource_categories: hosp.supported_resource_categories || ['BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'MEDICINE', 'EQUIPMENT', 'AMBULANCE'],
  };
}

export function normalizeDepartment(dept) {
  if (!dept) return null;
  const id = dept.id || dept.department_id;
  return {
    ...dept,
    department_id: id,
    id,
    hospital_id: dept.hospital_id,
    name: dept.name,
    code: dept.code || dept.name.slice(0, 4).toUpperCase(),
    doctor_count: dept.doctor_count || 1,
    average_consultation_minutes: dept.average_consultation_minutes || 15,
  };
}

export function normalizeDoctor(doc) {
  if (!doc) return null;
  const id = doc.id || doc.doctor_id;
  const deptName = doc.departments?.name || doc.department_name || doc.specialization || 'General Medicine';
  return {
    ...doc,
    doctor_id: id,
    id,
    hospital_id: doc.hospital_id,
    department_id: doc.department_id,
    department_name: deptName,
    name: doc.name,
    specialization: doc.specialization || deptName || 'Consultant Specialist',
    consultation_fee: Number(doc.consultation_fee) || 500,
    consultation_duration_minutes: doc.consultation_duration_minutes || 15,
    room_number: doc.room_number || 'OPD 101',
    is_active: doc.is_active ?? doc.active_status ?? true,
    active_status: doc.is_active ?? doc.active_status ?? true,
  };
}

export function normalizePatient(pt) {
  if (!pt) return null;
  const id = pt.id || pt.patient_id;
  const name = pt.full_name || pt.name;
  const phone = pt.phone_number || pt.phone;
  return {
    ...pt,
    patient_id: id,
    id,
    name,
    full_name: name,
    phone,
    phone_number: phone,
    patient_code: pt.patient_code || `PAT-${(id || '').slice(0, 6).toUpperCase()}`,
    consent_status: pt.consent_status ?? true,
  };
}

export const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());

export function normalizeSlot(s) {
  if (!s) return null;
  const id = s.id || s.slot_id;
  const display = s.display_time || formatTo12Hour(s.start_time);
  return {
    ...s,
    slot_id: id,
    id,
    doctor_id: s.doctor_id,
    doctor_name: s.doctor_name,
    slot_date: s.slot_date || s.date,
    date: s.slot_date || s.date,
    start_time: s.start_time,
    end_time: s.end_time,
    display_time: display,
    status: (s.status || 'available').toUpperCase() === 'AVAILABLE' ? 'AVAILABLE' : 'BOOKED',
  };
}

export function normalizeAppointment(appt) {
  if (!appt) return null;
  const id = appt.id || appt.appointment_id;
  const token = appt.token_number || appt.token;
  const patientName = appt.patient_name || appt.patients?.full_name || appt.patients?.name || 'Patient';
  const patientPhone = appt.patient_phone || appt.phone || appt.patients?.phone_number || appt.patients?.phone || '';
  const doctorName = appt.doctor_name || appt.doctors?.name || 'Assigned Doctor';
  const departmentName = appt.department_name || appt.departments?.name || appt.doctors?.departments?.name || 'OPD';
  const hospitalName = appt.hospital_name || appt.hospitals?.name || 'Hospital';

  return {
    ...appt,
    appointment_id: id,
    id,
    token,
    token_number: token,
    patient_id: appt.patient_id,
    patient_name: patientName,
    patient_phone: patientPhone,
    doctor_id: appt.doctor_id,
    doctor_name: doctorName,
    hospital_id: appt.hospital_id,
    hospital_name: hospitalName,
    department_id: appt.department_id,
    department_name: departmentName,
    slot_id: appt.slot_id,
    status: (appt.status || 'booked').toUpperCase(),
    queue_position: appt.queue_position !== undefined && appt.queue_position !== null ? Number(appt.queue_position) : 1,
    estimated_wait_minutes: appt.estimated_wait_minutes || 15,
    appointment_date: appt.appointment_date || (appt.slots?.slot_date) || (appt.created_at ? appt.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    appointment_time: appt.appointment_time || (appt.slots ? formatTo12Hour(appt.slots.start_time) : '10:00 AM'),
    created_at: appt.created_at,
    updated_at: appt.updated_at,
  };
}

// ============================================================================
// IN-MEMORY SEED STORE (Fallback when database offline)
// ============================================================================
class InMemoryDatabase {
  constructor() {
    this.reset();
  }

  reset() {
    this.hospitals = [
      {
        hospital_id: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0',
        id: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0',
        name: 'Yashoda Hospital',
        latitude: 12.9716,
        longitude: 77.5946,
        contact: '8700061255',
        phone: '8700061255',
        address: 'Delhi',
        emergency_contact: '102 / +91-11-26594405',
        telegram_chat_id: '6537122486',
        active_status: true,
        is_active: true,
        verification_status: 'VERIFIED',
        supported_resource_categories: ['BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'MEDICINE', 'EQUIPMENT', 'AMBULANCE'],
      },
      {
        hospital_id: '11111111-1111-4111-a111-111111111111',
        id: '11111111-1111-4111-a111-111111111111',
        name: 'All India Institute of Medical Sciences (AIIMS) New Delhi',
        latitude: 28.5672,
        longitude: 77.21,
        contact: '+91-11-26588500',
        phone: '+91-11-26588500',
        address: 'Sri Aurobindo Marg, Ansari Nagar, New Delhi 110029',
        emergency_contact: '102 / +91-11-26594405',
        telegram_chat_id: '6537122486',
        active_status: true,
        is_active: true,
        verification_status: 'VERIFIED',
        supported_resource_categories: ['BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'MEDICINE', 'EQUIPMENT', 'AMBULANCE'],
      },
    ];

    this.departments = [
      { department_id: '79914d3e-1112-47bf-b3f9-3facdbd31d04', id: '79914d3e-1112-47bf-b3f9-3facdbd31d04', hospital_id: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0', name: 'Cardiology', code: 'CARD' },
      { department_id: 'b7512ac3-6be5-4449-93e0-98d4a059d382', id: 'b7512ac3-6be5-4449-93e0-98d4a059d382', hospital_id: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0', name: 'Orthopedics', code: 'ORTHO' },
      { department_id: '476b2552-7c7d-4d27-b01b-4bce1e33347a', id: '476b2552-7c7d-4d27-b01b-4bce1e33347a', hospital_id: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0', name: 'General Medicine', code: 'GENMED' },
      { department_id: 'd2dbb8b3-df50-4b9d-9d24-0fcd4b902ed3', id: 'd2dbb8b3-df50-4b9d-9d24-0fcd4b902ed3', hospital_id: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0', name: 'Pediatrics', code: 'PEDIA' },
    ];

    this.doctors = [
      {
        doctor_id: '51b2a6b8-52aa-4586-baa1-8e352b82903f',
        id: '51b2a6b8-52aa-4586-baa1-8e352b82903f',
        hospital_id: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0',
        department_id: '79914d3e-1112-47bf-b3f9-3facdbd31d04',
        name: 'Dr. Ananya Roy',
        specialization: 'Senior Interventional Cardiologist, MD, DM',
        consultation_fee: 500,
        active_status: true,
        is_active: true,
      },
      {
        doctor_id: 'def5ff12-6f2f-43a0-b8d0-5aec91d7a320',
        id: 'def5ff12-6f2f-43a0-b8d0-5aec91d7a320',
        hospital_id: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0',
        department_id: 'b7512ac3-6be5-4449-93e0-98d4a059d382',
        name: 'Dr. Rajesh Sharma',
        specialization: 'Senior Orthopedic & Joint Replacement Surgeon, MS',
        consultation_fee: 600,
        active_status: true,
        is_active: true,
      },
      {
        doctor_id: 'a0000004-0000-4000-a000-000000000004',
        id: 'a0000004-0000-4000-a000-000000000004',
        hospital_id: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0',
        department_id: '476b2552-7c7d-4d27-b01b-4bce1e33347a',
        name: 'Dr. Priya Nair',
        specialization: 'Senior Consultant Physician, MBBS, MD (General Medicine)',
        consultation_fee: 400,
        active_status: true,
        is_active: true,
      },
      {
        doctor_id: 'a0000005-0000-4000-a000-000000000005',
        id: 'a0000005-0000-4000-a000-000000000005',
        hospital_id: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0',
        department_id: 'd2dbb8b3-df50-4b9d-9d24-0fcd4b902ed3',
        name: 'Dr. Vikramaditya Rao',
        specialization: 'Pediatric Specialist & Neonatologist, MD',
        consultation_fee: 500,
        active_status: true,
        is_active: true,
      },
    ];

    this.patients = [
      { patient_id: 'a0d515d9-8389-4daf-88af-5c34921da5c2', id: 'a0d515d9-8389-4daf-88af-5c34921da5c2', name: 'Rahul Sharma', full_name: 'Rahul Sharma', phone: '8700061255', phone_number: '8700061255', consent_status: true },
    ];

    this.users = [
      {
        user_id: 'u0000002-0000-4000-a000-000000000002',
        hospital_id: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0',
        role: 'RECEPTIONIST',
        name: 'Pooja Verma (OPD Desk A)',
        phone: '+919811000001',
        status: 'ACTIVE',
      },
      {
        user_id: 'u0000001-0000-4000-a000-000000000001',
        hospital_id: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0',
        role: 'ADMIN',
        name: 'Dr. Alok Nath',
        phone: '+919811000000',
        status: 'ACTIVE',
      },
    ];

    this.doctor_slots = [];
    this.appointments = [];
    this.queue_entries = [];
    this.emergency_requests = [];
    this.dispatches = [];

    this.generateDefaultSlots();
  }

  generateDefaultSlots() {
    const today = new Date();
    for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
      const d = new Date(today.getTime() + dayOffset * 86400000);
      const dateStr = d.toISOString().split('T')[0];

      for (const doc of this.doctors) {
        const timeBlocks = [
          { start: '09:00:00', end: '09:30:00', label: '09:00 AM' },
          { start: '09:30:00', end: '10:00:00', label: '09:30 AM' },
          { start: '10:00:00', end: '10:30:00', label: '10:00 AM' },
          { start: '10:30:00', end: '11:00:00', label: '10:30 AM' },
          { start: '11:00:00', end: '11:30:00', label: '11:00 AM' },
          { start: '11:30:00', end: '12:00:00', label: '11:30 AM' },
          { start: '14:00:00', end: '14:30:00', label: '02:00 PM' },
          { start: '14:30:00', end: '15:00:00', label: '02:30 PM' },
          { start: '15:00:00', end: '15:30:00', label: '03:00 PM' },
          { start: '15:30:00', end: '16:00:00', label: '03:30 PM' },
          { start: '16:00:00', end: '16:30:00', label: '04:00 PM' },
        ];

        timeBlocks.forEach((tb, i) => {
          this.doctor_slots.push({
            slot_id: `slot-${doc.doctor_id.slice(0, 8)}-${dateStr}-${i + 1}`,
            id: `slot-${doc.doctor_id.slice(0, 8)}-${dateStr}-${i + 1}`,
            doctor_id: doc.doctor_id,
            start_time: tb.start,
            end_time: tb.end,
            display_time: tb.label,
            date: dateStr,
            slot_date: dateStr,
            status: 'AVAILABLE',
          });
        });
      }
    }
  }

  getHospitals() {
    return this.hospitals;
  }

  getDepartments(hospitalId) {
    if (!hospitalId) return this.departments;
    return this.departments.filter(d => d.hospital_id === hospitalId);
  }

  getDoctors(hospitalId, departmentId) {
    let res = this.doctors.filter(d => d.active_status);
    if (hospitalId) res = res.filter(d => d.hospital_id === hospitalId);
    if (departmentId) res = res.filter(d => d.department_id === departmentId);
    return res;
  }

  getDoctorById(doctorId) {
    return this.doctors.find(d => d.doctor_id === doctorId || d.id === doctorId);
  }

  getDoctorSlots(doctorId, date, includeAll = false) {
    return this.doctor_slots.filter(s =>
      (s.doctor_id === doctorId || s.id === doctorId) &&
      (!date || s.date === date || s.slot_date === date) &&
      (includeAll || s.status === 'AVAILABLE')
    );
  }

  calculateAvailableSlots(doctorId, date) {
    const slots = this.getDoctorSlots(doctorId, date, false);
    return slots.map(s => s.display_time);
  }

  getAllDoctorSlots(doctorId, date) {
    const slots = this.getDoctorSlots(doctorId, date, true);
    return slots.map(s => ({
      ...s,
      available: s.status === 'AVAILABLE',
    }));
  }

  getPatients(query) {
    if (!query) return this.patients;
    const q = query.toLowerCase();
    return this.patients.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q));
  }

  getPatientByPhone(phone) {
    if (!phone) return null;
    const clean = phone.replace(/[\s\-]/g, '');
    return this.patients.find(p => p.phone.replace(/[\s\-]/g, '') === clean || clean.endsWith(p.phone.slice(-10)));
  }

  getPatientById(patientId) {
    if (!patientId) return null;
    return this.patients.find(p => p.patient_id === patientId || p.id === patientId) || null;
  }

  createPatient({ name, phone, email = '' }) {
    const p = {
      patient_id: randomUUID(),
      id: randomUUID(),
      name,
      full_name: name,
      phone,
      phone_number: phone,
      email,
      consent_status: true,
      patient_code: `PAT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    };
    this.patients.push(p);
    return p;
  }

  getAppointments(filter = {}) {
    let res = [...this.appointments];
    if (filter.hospital_id) res = res.filter(a => !a.hospital_id || a.hospital_id === filter.hospital_id);
    if (filter.doctor_id) res = res.filter(a => a.doctor_id === filter.doctor_id);
    if (filter.patient_id) res = res.filter(a => a.patient_id === filter.patient_id);
    if (filter.status) res = res.filter(a => a.status === filter.status);
    return res;
  }

  getLiveQueueAppointments({
    hospitalId,
    doctorId,
    departmentId,
    includeCompleted = false,
    includeCancelled = false,
  } = {}) {
    let res = [...this.appointments];
    if (hospitalId) res = res.filter(a => !a.hospital_id || a.hospital_id === hospitalId);
    if (doctorId) res = res.filter(a => a.doctor_id === doctorId);
    if (departmentId) res = res.filter(a => a.department_id === departmentId);

    const allowed = ['WAITING', 'CHECKED_IN', 'IN_CONSULTATION', 'BOOKED', 'booked', 'checked_in', 'in_consultation'];
    if (includeCompleted) allowed.push('COMPLETED', 'completed');
    if (includeCancelled) allowed.push('CANCELLED', 'cancelled', 'NO_SHOW', 'no_show', 'SKIPPED');

    res = res.filter(a => allowed.includes(a.status));
    return res;
  }

  updateAppointmentStatus(appointmentId, { status, queue_position, symptoms_summary, estimated_wait_minutes, notes } = {}) {
    const appt = this.appointments.find(a =>
      a.appointment_id === appointmentId ||
      a.id === appointmentId ||
      a.token === appointmentId ||
      a.token_number === appointmentId
    );
    if (!appt) return null;
    if (status !== undefined) appt.status = status.toUpperCase();
    if (queue_position !== undefined) appt.queue_position = queue_position;
    if (symptoms_summary !== undefined) appt.symptoms_summary = symptoms_summary;
    if (estimated_wait_minutes !== undefined) appt.estimated_wait_minutes = estimated_wait_minutes;
    appt.updated_at = new Date().toISOString();

    const qEntry = this.queue_entries.find(q =>
      q.appointment_id === appt.id ||
      q.appointment_id === appt.appointment_id ||
      q.token === appt.token ||
      q.token === appt.token_number
    );
    if (qEntry) {
      if (status !== undefined) qEntry.status = status.toUpperCase();
      if (queue_position !== undefined) qEntry.position = queue_position;
      if (estimated_wait_minutes !== undefined) qEntry.estimated_wait_mins = estimated_wait_minutes;
    }
    return appt;
  }

  getAppointmentById(id) {
    return this.appointments.find(a => a.appointment_id === id || a.id === id || a.token === id || a.token_number === id);
  }

  bookAppointmentAtomic({ patient_id, doctor_id, department_id, slot_id, token, qr_ref }) {
    const slot = this.doctor_slots.find(s => (s.slot_id === slot_id || s.id === slot_id) && s.status === 'AVAILABLE');
    if (!slot) {
      return {
        success: false,
        error: 'SLOT_UNAVAILABLE',
        message: 'The requested slot is already booked or unavailable.',
      };
    }

    slot.status = 'BOOKED';

    const apptId = randomUUID();
    const tokenVal = token || `#MED-${Math.floor(1000 + Math.random() * 9000)}`;
    const signedQr = (qr_ref && qr_ref.startsWith('{')) ? { qrString: qr_ref, rawPayload: JSON.parse(qr_ref) } : generateSignedAppointmentQR({ appointment_id: apptId, token: tokenVal });
    const qrVal = signedQr.qrString;

    const apptDoc = this.doctors.find(d => d.doctor_id === doctor_id || d.id === doctor_id);
    const hospId = apptDoc?.hospital_id || this.hospitals[0]?.hospital_id || '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0';

    const appt = {
      appointment_id: apptId,
      id: apptId,
      hospital_id: hospId,
      patient_id,
      doctor_id,
      department_id,
      slot_id: slot.slot_id || slot.id,
      token: tokenVal,
      token_number: tokenVal,
      qr_reference: qrVal,
      status: 'BOOKED',
      appointment_date: slot.date || slot.slot_date,
      appointment_time: slot.display_time,
      queue_position: 1,
      estimated_wait_minutes: 15,
      created_at: new Date().toISOString(),
    };

    this.appointments.push(appt);

    return {
      success: true,
      appointment_id: apptId,
      token: tokenVal,
      token_number: tokenVal,
      qr_reference: qrVal,
      qr_code: qrVal,
      qr_data: signedQr.rawPayload,
      queue_position: 1,
      estimated_wait_minutes: 15,
      appointment: appt,
    };
  }

  bookEmergencyAppointmentAtomic({
    patient_id,
    department_id,
    department_name,
    hospital_id,
    patient_name,
    patient_phone,
    symptoms = 'Emergency Consultation',
    token,
    qr_ref,
  }) {
    // 1. Resolve department
    let targetDept = null;
    if (department_id) {
      targetDept = this.departments.find(d => d.department_id === department_id || d.id === department_id);
    }
    if (!targetDept && department_name) {
      const dNameLower = department_name.toLowerCase().trim();
      targetDept = this.departments.find(d =>
        d.name.toLowerCase().includes(dNameLower) ||
        dNameLower.includes(d.name.toLowerCase()) ||
        (d.code && d.code.toLowerCase() === dNameLower)
      );
      if (!targetDept) {
        return {
          success: false,
          error: 'NO_DOCTORS_AVAILABLE',
          message: `No suitable emergency doctors or slots currently available for specialty: ${department_name}.`,
          department: department_name,
          fallback: {
            emergency_contact: '102',
            action: 'CONTACT_EMERGENCY_DESK',
            alternate_hospitals_url: '/api/hospitals/nearby',
          },
        };
      }
    }
    if (!targetDept && symptoms) {
      const symLower = symptoms.toLowerCase();
      if (symLower.includes('chest') || symLower.includes('heart') || symLower.includes('cardio')) {
        targetDept = this.departments.find(d => d.name.toLowerCase().includes('cardio'));
      } else if (symLower.includes('bone') || symLower.includes('joint') || symLower.includes('fracture') || symLower.includes('ortho')) {
        targetDept = this.departments.find(d => d.name.toLowerCase().includes('ortho'));
      } else if (symLower.includes('child') || symLower.includes('baby') || symLower.includes('pedia')) {
        targetDept = this.departments.find(d => d.name.toLowerCase().includes('pedia'));
      }
    }
    if (!targetDept) {
      targetDept = this.departments.find(d => d.name.toLowerCase().includes('emergency') || d.name.toLowerCase().includes('general')) || this.departments[0];
    }

    // 2. Identify candidate doctors for this department (and hospital if specified)
    let candidateDocs = this.doctors.filter(d => (d.active_status || d.is_active));
    if (targetDept) {
      candidateDocs = candidateDocs.filter(d => d.department_id === targetDept.department_id || d.department_id === targetDept.id);
    }
    if (hospital_id) {
      const hospDocs = candidateDocs.filter(d => d.hospital_id === hospital_id);
      if (hospDocs.length > 0) candidateDocs = hospDocs;
    }

    if (!candidateDocs || candidateDocs.length === 0) {
      return {
        success: false,
        error: 'NO_DOCTORS_AVAILABLE',
        message: `No active specialists currently available in ${targetDept?.name || 'the requested department'}.`,
        department: targetDept?.name || department_name,
        fallback: {
          emergency_contact: '102',
          action: 'CONTACT_EMERGENCY_DESK',
          alternate_hospitals_url: '/api/hospitals/nearby',
        },
      };
    }

    // 3. Find candidate available slots across candidate doctors
    const candidateDocIds = new Set(candidateDocs.map(d => d.doctor_id || d.id));
    const todayStr = new Date().toISOString().split('T')[0];

    const availableSlots = this.doctor_slots.filter(s =>
      candidateDocIds.has(s.doctor_id) &&
      s.status === 'AVAILABLE' &&
      (!s.date || s.date >= todayStr)
    );

    if (availableSlots.length === 0) {
      return {
        success: false,
        error: 'NO_EMERGENCY_SLOT_AVAILABLE',
        message: `No suitable emergency slot currently available for ${targetDept?.name || 'the requested department'}.`,
        department: targetDept?.name || department_name,
        department_id: targetDept?.department_id,
        fallback: {
          emergency_contact: '102',
          action: 'CONTACT_EMERGENCY_DESK',
          alternate_hospitals_url: '/api/hospitals/nearby',
        },
      };
    }

    // 4. Deterministic Priority Sorting:
    // a. Date ascending (earliest date first)
    // b. Start time ascending (earliest time first)
    // c. Doctor queue load / doctor_id tie-breaker
    availableSlots.sort((a, b) => {
      const dateA = a.date || a.slot_date || '';
      const dateB = b.date || b.slot_date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = a.start_time || '';
      const timeB = b.start_time || '';
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      return (a.doctor_id || '').localeCompare(b.doctor_id || '');
    });

    const selectedSlot = availableSlots[0];
    selectedSlot.status = 'BOOKED';

    const doctor = candidateDocs.find(d => (d.doctor_id === selectedSlot.doctor_id || d.id === selectedSlot.doctor_id)) || candidateDocs[0];
    const hospital = this.hospitals.find(h => h.hospital_id === doctor.hospital_id) || this.hospitals[0];

    const apptId = randomUUID();
    const tokenVal = token || `#EMERG-${Math.floor(1000 + Math.random() * 9000)}`;
    const signedQr = (qr_ref && qr_ref.startsWith('{')) ? { qrString: qr_ref, rawPayload: JSON.parse(qr_ref) } : generateSignedAppointmentQR({ appointment_id: apptId, token: tokenVal });
    const qrVal = signedQr.qrString;

    const docDisplayName = doctor.name.startsWith('Dr.') ? doctor.name : `Dr. ${doctor.name}`;
    const rationale = `Specialty: ${targetDept?.name || 'Urgent Care'} matched. Allocated ${docDisplayName} (${hospital.name}) due to earliest available urgent slot on ${selectedSlot.date || selectedSlot.slot_date} at ${selectedSlot.display_time}.`;

    const appt = {
      appointment_id: apptId,
      id: apptId,
      hospital_id: hospital.hospital_id,
      patient_id,
      doctor_id: doctor.doctor_id,
      department_id: targetDept?.department_id || doctor.department_id,
      slot_id: selectedSlot.slot_id || selectedSlot.id,
      token: tokenVal,
      token_number: tokenVal,
      qr_reference: qrVal,
      status: 'BOOKED',
      is_emergency: true,
      urgency: 'HIGH',
      appointment_date: selectedSlot.date || selectedSlot.slot_date,
      appointment_time: selectedSlot.display_time,
      queue_position: 1,
      estimated_wait_minutes: 5,
      created_at: new Date().toISOString(),
      symptoms: symptoms || 'Emergency Consultation',
      selection_rationale: rationale,
    };

    this.appointments.push(appt);

    this.queue_entries.push({
      queue_id: randomUUID(),
      appointment_id: apptId,
      patient_id,
      doctor_id: doctor.doctor_id,
      token: tokenVal,
      position: 1,
      is_emergency: true,
      status: 'WAITING',
      check_in_at: new Date().toISOString(),
    });

    return {
      success: true,
      appointment_id: apptId,
      id: apptId,
      token: tokenVal,
      token_number: tokenVal,
      qr_reference: qrVal,
      qr_code: qrVal,
      qr_data: signedQr.rawPayload,
      queue_position: 1,
      estimated_wait_minutes: 5,
      is_emergency: true,
      doctor: {
        doctor_id: doctor.doctor_id,
        name: doctor.name,
        department_name: targetDept?.name || doctor.department_name || 'Emergency Specialty',
        room_number: doctor.room_number || 'OPD Emergency Desk',
      },
      slot: {
        slot_id: selectedSlot.slot_id,
        start_time: selectedSlot.start_time,
        display_time: selectedSlot.display_time,
        date: selectedSlot.date,
      },
      hospital: {
        hospital_id: hospital.hospital_id,
        name: hospital.name,
        emergency_contact: hospital.emergency_contact || '102',
      },
      selection_rationale: rationale,
      appointment: appt,
    };
  }

  cancelAppointment(idOrToken) {
    const appt = this.appointments.find(a => a.appointment_id === idOrToken || a.id === idOrToken || a.token === idOrToken || a.token_number === idOrToken);
    if (!appt) throw new Error('Appointment not found');

    appt.status = 'CANCELLED';
    appt.queue_position = null;
    const slot = this.doctor_slots.find(s => s.slot_id === appt.slot_id || s.id === appt.slot_id);
    if (slot) slot.status = 'AVAILABLE';

    return appt;
  }

  releaseSlot(slotId) {
    if (!slotId) return null;
    const slot = this.doctor_slots.find(s => s.slot_id === slotId || s.id === slotId);
    if (slot) slot.status = 'AVAILABLE';
    return slot;
  }

  getPatientQueueMetrics(tokenIdOrApptId) {
    const appt = this.appointments.find(a => a.token === tokenIdOrApptId || a.token_number === tokenIdOrApptId || a.appointment_id === tokenIdOrApptId || a.id === tokenIdOrApptId);
    if (!appt) {
      return {
        my_token: tokenIdOrApptId,
        current_token: 'None',
        queue_position: 1,
        people_ahead: 0,
        estimated_wait_minutes: 0,
        status: 'WAITING',
      };
    }

    const activeAppts = this.appointments.filter(a => a.doctor_id === appt.doctor_id && a.status === 'BOOKED');
    const ahead = Math.max(0, activeAppts.indexOf(appt));

    return {
      my_token: appt.token || appt.token_number,
      current_token: 'None',
      queue_position: ahead + 1,
      people_ahead: ahead,
      estimated_wait_minutes: ahead * 15,
      status: appt.status,
    };
  }

  createEmergencyRequest({ requesting_hospital_id, resource_type, quantity, urgency, notes }) {
    const req = {
      request_id: randomUUID(),
      id: randomUUID(),
      requesting_hospital_id,
      resource_type,
      quantity,
      urgency,
      notes,
      status: 'OPEN',
      created_at: new Date().toISOString(),
    };
    this.emergency_requests.push(req);
    const matches = this.hospitals.filter(h => h.hospital_id !== requesting_hospital_id);
    return { success: true, request: req, matches };
  }

  acceptEmergencyRequest({ request_id, supplying_hospital_id, supplying_hospital_name }) {
    const req = this.emergency_requests.find(r => r.request_id === request_id || r.id === request_id);
    if (!req) {
      return { success: false, error: 'REQUEST_NOT_FOUND', message: 'Emergency request not found' };
    }
    req.status = 'ACCEPTED';
    req.supplying_hospital_id = supplying_hospital_id;
    req.responding_hospital_id = supplying_hospital_id;
    req.supplying_hospital_name = supplying_hospital_name || 'Hospital';
    const dispatchId = `DISP-${Math.floor(100000 + Math.random() * 900000)}`;
    const signedPass = generateSignedDispatchQR({
      dispatch_id: dispatchId,
      request_id: req.request_id || req.id,
      donor_hospital_id: supplying_hospital_id,
      requester_hospital_id: req.requesting_hospital_id,
      resource_type: req.resource_type,
      quantity: req.quantity,
    });
    return {
      success: true,
      dispatch_id: dispatchId,
      qr_token_hash: signedPass.token || signedPass.sig,
      qr_code: signedPass.qrString,
      request: {
        ...req,
        request_id: req.id || req.request_id,
        supplying_hospital_id,
        supplying_hospital_name: supplying_hospital_name || 'Hospital',
        dispatch_id: dispatchId,
      },
      message: 'Emergency request accepted and inventory allocated successfully.',
    };
  }

  verifyAndCheckInAppointment({ tokenId, appointmentId, action = 'verify', user = null }) {
    const normalizedToken = tokenId ? (tokenId.startsWith('#') ? tokenId : `#${tokenId}`) : null;
    const appt = this.appointments.find(a =>
      (appointmentId && (a.appointment_id === appointmentId || a.id === appointmentId)) ||
      (normalizedToken && (a.token === normalizedToken || a.token_number === normalizedToken || a.token === tokenId || a.token_number === tokenId))
    );

    if (!appt) {
      return {
        success: false,
        status: 'NOT FOUND',
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'No matching appointment record found in the hospital database.',
      };
    }

    const doctor = this.doctors.find(d => d.doctor_id === appt.doctor_id || d.id === appt.doctor_id);
    const dept = this.departments.find(d => d.department_id === appt.department_id || d.id === appt.department_id);
    const hosp = this.hospitals.find(h => h.hospital_id === appt.hospital_id || h.id === appt.hospital_id);
    const patient = this.patients.find(p => p.patient_id === appt.patient_id || p.id === appt.patient_id);

    const docName = doctor?.name || appt.doctor_name || 'Assigned Doctor';
    const deptName = dept?.name || appt.department_name || 'General OPD';
    const hospName = hosp?.name || appt.hospital_name || 'MedConnect Partner Hospital';
    const patName = patient?.name || appt.patient_name || 'Patient';
    const patPhone = patient?.phone || appt.patient_phone || '';

    // Check authorization: if authenticated as a patient, must own the appointment
    if (user && user.role === 'patient') {
      const isOwner = (user.id && (user.id === appt.patient_id || user.id === patient?.id || user.id === patient?.patient_id)) ||
                      (user.phone && (user.phone === patPhone || (patPhone && patPhone.endsWith(user.phone.slice(-10)))));
      if (!isOwner) {
        return {
          success: false,
          status: 'FORBIDDEN',
          code: 'UNAUTHORIZED_ACCESS',
          message: 'Access denied: You are not authorized to view or verify another patient’s appointment pass.',
        };
      }
    }

    // Role-based information masking
    const isStaff = user && ['hospital', 'receptionist', 'doctor', 'admin'].includes(user.role?.toLowerCase());
    const isOwner = user && ((user.id && (user.id === appt.patient_id || user.id === patient?.id)) || (user.phone && user.phone === patPhone));
    const permittedPatientName = (isStaff || isOwner) ? patName : `${patName.slice(0, 1)}***`;
    const permittedPatientPhone = (isStaff || isOwner) ? patPhone : (patPhone ? `+91 ******${patPhone.slice(-4)}` : '');

    const apptDetails = {
      appointment_id: appt.appointment_id || appt.id,
      token: appt.token || appt.token_number,
      doctor_name: docName,
      department_name: deptName,
      hospital_name: hospName,
      appointment_date: appt.appointment_date,
      appointment_time: appt.appointment_time,
      status: appt.status,
      queue_position: appt.queue_position || 1,
      estimated_wait_minutes: appt.estimated_wait_minutes || 15,
      patient_name: permittedPatientName,
      patient_phone: permittedPatientPhone,
    };

    // Check status
    if (appt.status === 'CANCELLED') {
      return {
        success: false,
        status: 'CANCELLED',
        code: 'APPOINTMENT_CANCELLED',
        message: 'This appointment was cancelled and cannot be used for check-in.',
        appointment: apptDetails,
      };
    }

    if (['CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED'].includes(appt.status)) {
      const qEntry = this.queue_entries.find(q => q.appointment_id === appt.appointment_id || q.appointment_id === appt.id);
      return {
        success: false,
        status: 'ALREADY USED / CHECKED IN',
        code: 'ALREADY_CHECKED_IN',
        message: `Patient has already checked in with this QR token (Status: ${appt.status}).`,
        appointment: apptDetails,
        queue_position: qEntry?.position || appt.queue_position || 1,
      };
    }

    if (action === 'check_in') {
      appt.status = 'CHECKED_IN';
      const waitingCount = this.queue_entries.filter(q => q.status === 'WAITING').length;
      const isEmergency = (appt.token || appt.token_number || '').startsWith('#EMERG-') || Boolean(appt.is_emergency);
      const newPos = isEmergency ? 1 : (waitingCount + 1);
      appt.queue_position = newPos;
      appt.estimated_wait_minutes = isEmergency ? 5 : ((newPos - 1) * 15);
      appt.check_in_at = new Date().toISOString();

      let qEntry = this.queue_entries.find(q => q.appointment_id === appt.appointment_id || q.appointment_id === appt.id);
      if (!qEntry) {
        qEntry = {
          queue_id: randomUUID(),
          appointment_id: appt.appointment_id || appt.id,
          patient_id: appt.patient_id,
          doctor_id: appt.doctor_id,
          token: appt.token || appt.token_number,
          position: newPos,
          status: 'WAITING',
          check_in_at: new Date().toISOString(),
          estimated_wait_mins: (newPos - 1) * 15,
        };
        this.queue_entries.push(qEntry);
      } else {
        qEntry.status = 'WAITING';
        qEntry.position = newPos;
      }

      apptDetails.status = 'CHECKED_IN';
      apptDetails.queue_position = newPos;
      apptDetails.estimated_wait_minutes = (newPos - 1) * 15;

      return {
        success: true,
        verified: true,
        token: apptDetails.token,
        status: 'VALID',
        code: 'CHECK_IN_SUCCESSFUL',
        action_performed: 'CHECKED_IN',
        message: `Check-in verified successfully. Patient ${apptDetails.patient_name} enqueued at position ${newPos}.`,
        appointment: apptDetails,
        queue_position: newPos,
        estimated_wait_minutes: (newPos - 1) * 15,
        verified_at: new Date().toISOString(),
      };
    }

    // Read-only verification
    return {
      success: true,
      verified: true,
      token: apptDetails.token,
      status: 'VALID',
      code: 'QR_VALID',
      can_check_in: true,
      message: 'QR pass is valid and ready for check-in.',
      appointment: apptDetails,
      verified_at: new Date().toISOString(),
    };
  }

  verifyAndRedeemDispatchPass({ dispatchId, tokenHash, action = 'verify', user = null }) {
    let dispatch = this.dispatches.find(d =>
      (dispatchId && (d.dispatch_id === dispatchId || d.id === dispatchId)) ||
      (tokenHash && (d.qr_reference === tokenHash || d.qr_token_hash === tokenHash))
    );

    if (!dispatch) {
      return {
        success: false,
        status: 'NOT FOUND',
        code: 'DISPATCH_NOT_FOUND',
        message: 'No emergency dispatch pass record found.',
      };
    }

    if (dispatch.status === 'CANCELLED') {
      return {
        success: false,
        status: 'CANCELLED',
        code: 'DISPATCH_CANCELLED',
        message: 'This emergency dispatch pass was cancelled.',
        dispatch,
      };
    }

    if (['DELIVERED', 'COMPLETED'].includes(dispatch.status)) {
      return {
        success: false,
        status: 'ALREADY USED / CHECKED IN',
        code: 'ALREADY_REDEEMED',
        message: 'This emergency handover pass has already been redeemed.',
        dispatch,
      };
    }

    if (action === 'check_in' || action === 'redeem') {
      dispatch.status = 'DELIVERED';
      dispatch.verified_at = new Date().toISOString();
      return {
        success: true,
        status: 'VALID',
        code: 'HANDOVER_VERIFIED',
        action_performed: 'DELIVERED',
        message: 'Emergency dispatch pass verified and handover completed.',
        dispatch,
        verified_at: dispatch.verified_at,
      };
    }

    return {
      success: true,
      status: 'VALID',
      code: 'DISPATCH_VALID',
      can_redeem: true,
      message: 'Emergency dispatch pass is valid and active.',
      dispatch,
      verified_at: new Date().toISOString(),
    };
  }
}

const inMemoryDb = new InMemoryDatabase();

// ============================================================================
// EXPORTED DATABASE INTERFACE (Direct Real Supabase Data with In-Memory Fallback)
// ============================================================================
export const db = {
  raw: supabase,
  inMemory: inMemoryDb,

  async getHospitals() {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('hospitals').select('*').eq('is_active', true);
        if (!error && data && data.length > 0) {
          return data.map(normalizeHospital);
        }
      } catch (err) {
        console.warn('[db] Error fetching real hospitals, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.getHospitals();
  },

  async getDepartments(hospitalId) {
    if (supabase) {
      try {
        let query = supabase.from('departments').select('*');
        if (hospitalId) query = query.eq('hospital_id', hospitalId);
        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          return data.map(normalizeDepartment);
        }
      } catch (err) {
        console.warn('[db] Error fetching real departments, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.getDepartments(hospitalId);
  },

  async getDoctors(hospitalId, departmentId) {
    if (supabase) {
      try {
        let query = supabase.from('doctors').select('*, departments(name)').eq('is_active', true);
        if (hospitalId) query = query.eq('hospital_id', hospitalId);
        if (departmentId) query = query.eq('department_id', departmentId);
        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          return data.map(normalizeDoctor);
        }
      } catch (err) {
        console.warn('[db] Error fetching real doctors, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.getDoctors(hospitalId, departmentId);
  },

  async getDoctorById(doctorId) {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('doctors').select('*, departments(name)').eq('id', doctorId).single();
        if (!error && data) return normalizeDoctor(data);
      } catch (err) {
        console.warn('[db] Error fetching real doctor by id, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.getDoctorById(doctorId);
  },

  async getDoctorSlots(doctorId, date, includeAll = false) {
    if (supabase) {
      try {
        let query = supabase
          .from('slots')
          .select('*')
          .eq('doctor_id', doctorId);

        if (!includeAll) {
          query = query.eq('status', 'available');
        }

        if (date) {
          query = query.eq('slot_date', date);
        }
        query = query.order('start_time', { ascending: true });

        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          return data.map(normalizeSlot);
        }
      } catch (err) {
        console.warn('[db] Error fetching real slots, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.getDoctorSlots(doctorId, date, includeAll);
  },

  async calculateAvailableSlots(doctorId, date) {
    const slots = await this.getDoctorSlots(doctorId, date, false);
    if (!slots || slots.length === 0) {
      return inMemoryDb.calculateAvailableSlots(doctorId, date);
    }
    return slots.map(s => s.display_time);
  },

  async getAllDoctorSlots(doctorId, date) {
    const slots = await this.getDoctorSlots(doctorId, date, true);
    if (!slots || slots.length === 0) {
      return inMemoryDb.getAllDoctorSlots(doctorId, date);
    }
    return slots.map(s => ({
      ...s,
      available: (s.status || '').toUpperCase() === 'AVAILABLE',
    }));
  },

  async getPatients(query) {
    if (supabase && query) {
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('*')
          .or(`full_name.ilike.%${query}%,phone_number.ilike.%${query}%`);
        if (!error && data && data.length > 0) {
          return data.map(normalizePatient);
        }
      } catch (err) {
        console.warn('[db] Error fetching real patients, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.getPatients(query);
  },

  async getPatientByPhone(phone) {
    if (supabase && phone) {
      try {
        const clean = phone.replace(/[\s\-]/g, '');
        const { data, error } = await supabase
          .from('patients')
          .select('*')
          .or(`phone_number.eq.${clean},phone_number.eq.${phone},phone_number.ilike.%${clean.slice(-10)}%`)
          .limit(1)
          .maybeSingle();
        if (!error && data) return normalizePatient(data);
      } catch (err) {
        console.warn('[db] Error fetching real patient by phone, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.getPatientByPhone(phone);
  },

  async getPatientById(patientId) {
    if (supabase && patientId) {
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .maybeSingle();
        if (!error && data) return normalizePatient(data);
      } catch (err) {
        console.warn('[db] Error fetching real patient by id, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.getPatientById(patientId);
  },

  async createPatient({ name, phone, email = '' }) {
    if (supabase) {
      try {
        const randomCode = 'PAT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const { data, error } = await supabase
          .from('patients')
          .insert([{
            full_name: name,
            phone_number: phone,
            patient_code: randomCode,
            consent_status: true,
          }])
          .select()
          .single();
        if (!error && data) return normalizePatient(data);
      } catch (err) {
        console.warn('[db] Error creating real patient in Supabase, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.createPatient({ name, phone, email });
  },

  async getAppointments(filter = {}) {
    if (supabase) {
      try {
        let q = supabase.from('appointments').select('*, doctors(name, hospital_id, specialization, room_number), departments(name), hospitals(name), slots(slot_date, start_time)');
        if (filter.hospital_id || filter.hospitalId) q = q.eq('hospital_id', filter.hospital_id || filter.hospitalId);
        if (filter.doctor_id || filter.doctorId) q = q.eq('doctor_id', filter.doctor_id || filter.doctorId);
        if (filter.patient_id || filter.patientId) q = q.eq('patient_id', filter.patient_id || filter.patientId);
        if (filter.phone) {
          const pt = await this.getPatientByPhone(filter.phone);
          if (pt) q = q.eq('patient_id', pt.id || pt.patient_id);
        }
        if (filter.status) q = q.eq('status', filter.status.toLowerCase());
        const { data, error } = await q.order('created_at', { ascending: false });
        if (!error && data) {
          return data.map(normalizeAppointment);
        }
      } catch (err) {
        console.warn('[db] Error fetching real appointments, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.getAppointments(filter);
  },

  async getLiveQueueAppointments({
    hospitalId,
    doctorId,
    departmentId,
    includeCompleted = false,
    includeCancelled = false,
  } = {}) {
    if (supabase) {
      try {
        let q = supabase
          .from('appointments')
          .select('*, doctors(id, name, hospital_id, department_id, specialization, room_number), departments(id, name), hospitals(id, name), patients(id, full_name, phone_number)')
          .order('created_at', { ascending: false });

        if (doctorId) {
          q = q.eq('doctor_id', doctorId);
        }
        if (departmentId) {
          q = q.eq('department_id', departmentId);
        }

        const allowedStatuses = ['checked_in', 'in_consultation', 'booked'];
        if (includeCompleted) allowedStatuses.push('completed');
        if (includeCancelled) allowedStatuses.push('cancelled', 'no_show');

        q = q.in('status', allowedStatuses);

        const { data, error } = await q;
        if (!error && data) {
          let filtered = data;
          if (hospitalId) {
            filtered = data.filter(a =>
              a.hospital_id === hospitalId ||
              a.doctors?.hospital_id === hospitalId ||
              !a.hospital_id
            );
          }
          return filtered.map(normalizeAppointment);
        }
      } catch (err) {
        console.warn('[db] Supabase getLiveQueueAppointments error, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.getLiveQueueAppointments({ hospitalId, doctorId, departmentId, includeCompleted, includeCancelled });
  },

  async updateAppointmentStatus(appointmentId, { status, queue_position, symptoms_summary, estimated_wait_minutes, notes } = {}) {
    if (supabase) {
      try {
        const payload = { updated_at: new Date().toISOString() };
        if (status !== undefined) payload.status = status.toLowerCase();
        if (queue_position !== undefined) payload.queue_position = queue_position;
        if (symptoms_summary !== undefined) payload.symptoms_summary = symptoms_summary;
        if (estimated_wait_minutes !== undefined) payload.estimated_wait_minutes = estimated_wait_minutes;

        let query = supabase.from('appointments').update(payload);
        const idStr = String(appointmentId).trim();
        const cleanTok = idStr.replace(/^#/, '');

        if (isUUID(idStr)) {
          query = query.or(`id.eq.${idStr},token_number.eq.${idStr}`);
        } else {
          query = query.or(`token_number.eq.${idStr},token_number.eq.#${cleanTok},token_number.eq.${cleanTok}`);
        }

        const { data, error } = await query.select('*, doctors(name), departments(name), hospitals(name), patients(full_name)').maybeSingle();
        if (!error && data) {
          inMemoryDb.updateAppointmentStatus(appointmentId, { status, queue_position, symptoms_summary, estimated_wait_minutes, notes });
          return normalizeAppointment(data);
        }
      } catch (err) {
        console.warn('[db] Supabase updateAppointmentStatus error:', err.message);
      }
    }
    return inMemoryDb.updateAppointmentStatus(appointmentId, { status, queue_position, symptoms_summary, estimated_wait_minutes, notes });
  },

  async releaseSlot(slotId) {
    if (!slotId) return null;
    if (supabase) {
      try {
        await supabase
          .from('slots')
          .update({ status: 'available' })
          .eq('id', slotId);
      } catch (err) {
        console.warn('[db] Supabase releaseSlot error:', err.message);
      }
    }
    return inMemoryDb.releaseSlot(slotId);
  },

  async getAppointmentById(appointmentId) {
    if (!appointmentId) return null;
    if (supabase) {
      try {
        const idStr = String(appointmentId).trim();
        const cleanTok = idStr.replace(/^#/, '');
        let query = supabase.from('appointments').select('*, doctors(name), departments(name), slots(slot_date, start_time)');
        if (isUUID(idStr)) {
          query = query.or(`id.eq.${idStr},token_number.eq.${idStr}`);
        } else {
          query = query.or(`token_number.eq.${idStr},token_number.eq.#${cleanTok},token_number.eq.${cleanTok}`);
        }
        const { data, error } = await query.maybeSingle();
        if (!error && data) return normalizeAppointment(data);
      } catch (err) {
        console.warn('[db] Error fetching real appointment by id, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.getAppointmentById(appointmentId);
  },

  async bookAppointmentAtomic({ patient_id, doctor_id, department_id, slot_id, token, qr_ref, symptoms, correlation_id }) {
    const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

    if (supabase) {
      try {
        let targetSlotId = slot_id;
        // If slot_id is not specified or not a valid UUID, look for real slot in DB
        if (!isUUID(targetSlotId) && doctor_id) {
          const { data: availSlots } = await supabase
            .from('slots')
            .select('id')
            .eq('doctor_id', doctor_id)
            .eq('status', 'available')
            .order('slot_date', { ascending: true })
            .order('start_time', { ascending: true })
            .limit(1);
          if (availSlots && availSlots.length > 0) {
            targetSlotId = availSlots[0].id;
          }
        }

        if (isUUID(targetSlotId)) {
          const corrId = correlation_id || `CORR-${Date.now()}-${randomUUID().slice(0, 6)}`;
          const { data, error } = await supabase.rpc('book_appointment_atomic', {
            p_slot_id: targetSlotId,
            p_patient_id: patient_id,
            p_symptoms: symptoms || 'Voice AI Receptionist Booking',
            p_correlation_id: corrId,
          });

          if (!error && data && data.success === true) {
            // Explicitly sync slot status in slots table for immediate consistency
            await supabase.from('slots').update({ status: 'booked' }).eq('id', targetSlotId);

            // Fetch booked appointment record
            const { data: apptRecord } = await supabase
              .from('appointments')
              .select('*, doctors(name), departments(name), slots(slot_date, start_time)')
              .eq('id', data.appointment_id)
              .maybeSingle();

            const tokenVal = data.token_number;
            const apptObj = apptRecord ? normalizeAppointment(apptRecord) : {
              id: data.appointment_id,
              appointment_id: data.appointment_id,
              doctor_id,
              department_id,
              patient_id,
              slot_id: targetSlotId,
              token_number: tokenVal,
              token: tokenVal,
              status: 'BOOKED',
              queue_position: data.queue_position || 1,
              estimated_wait_minutes: data.estimated_wait_minutes || 15,
            };

            const existingIdx = inMemoryDb.appointments.findIndex(a => a.id === data.appointment_id || a.appointment_id === data.appointment_id || a.token === tokenVal);
            if (existingIdx >= 0) {
              inMemoryDb.appointments[existingIdx] = apptObj;
            } else {
              inMemoryDb.appointments.push(apptObj);
            }

            return {
              success: true,
              appointment_id: data.appointment_id,
              id: data.appointment_id,
              token: tokenVal,
              token_number: tokenVal,
              qr_reference: data.qr_token_hash,
              queue_position: data.queue_position || 1,
              estimated_wait_minutes: data.estimated_wait_minutes || 15,
              appointment: apptObj,
            };
          } else if (data && data.success === false) {
            return {
              success: false,
              error: data.error_code || 'SLOT_UNAVAILABLE',
              message: data.message || 'The requested slot is already booked or unavailable.',
            };
          } else if (error) {
            console.warn('[db] Supabase book_appointment_atomic error, falling back to inMemoryDb:', error.message);
          }
        }
      } catch (err) {
        console.warn('[db] Supabase bookAppointmentAtomic failed, using in-memory store:', err.message);
      }
    }

    return inMemoryDb.bookAppointmentAtomic({
      patient_id,
      doctor_id,
      department_id,
      slot_id,
      token,
    });
  },

  async bookEmergencyAppointmentAtomic({
    patient_id,
    department_id,
    department_name,
    hospital_id,
    patient_name,
    patient_phone,
    symptoms = 'Emergency Consultation Request',
    correlation_id,
  }) {
    if (supabase) {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('book_emergency_appointment_atomic', {
          p_patient_id: patient_id,
          p_department_id: department_id || null,
          p_department_name: department_name || null,
          p_hospital_id: hospital_id || null,
          p_symptoms: symptoms,
        });

        if (!rpcErr && rpcData && rpcData.success === true) {
          return rpcData;
        }

        // Direct Supabase insertion fallback
        let targetDeptId = department_id;
        if (!targetDeptId && department_name) {
          const { data: depts } = await supabase
            .from('departments')
            .select('id, name')
            .ilike('name', `%${department_name}%`)
            .limit(1);
          if (depts && depts.length > 0) targetDeptId = depts[0].id;
        }

        let docQuery = supabase.from('doctors').select('id, name, hospital_id, department_id').eq('is_active', true);
        if (targetDeptId) docQuery = docQuery.eq('department_id', targetDeptId);
        if (hospital_id) docQuery = docQuery.eq('hospital_id', hospital_id);
        const { data: candidateDocs } = await docQuery.limit(5);

        const chosenDoc = candidateDocs?.[0] || (await supabase.from('doctors').select('id, name, hospital_id, department_id').limit(1).then(r => r.data?.[0]));

        if (chosenDoc) {
          let slotQuery = supabase.from('slots').select('id, slot_date, start_time, end_time').eq('doctor_id', chosenDoc.id).eq('status', 'available').order('slot_date', { ascending: true }).limit(1);
          let { data: availSlots } = await slotQuery;
          if (!availSlots || availSlots.length === 0) {
            const { data: anySlots } = await supabase.from('slots').select('id, slot_date, start_time, end_time').eq('doctor_id', chosenDoc.id).limit(1);
            availSlots = anySlots;
          }
          const chosenSlot = availSlots?.[0];

          if (chosenSlot) {
            const tokenVal = `#EMERG-${Math.floor(1000 + Math.random() * 9000)}`;
            const nowIso = new Date().toISOString();
            const apptId = randomUUID();
            const signedQr = generateSignedAppointmentQR({ appointment_id: apptId, token: tokenVal });

            const { data: insertedAppt, error: insertErr } = await supabase.from('appointments').insert({
              id: apptId,
              slot_id: chosenSlot.id,
              patient_id: patient_id,
              doctor_id: chosenDoc.id,
              department_id: chosenDoc.department_id,
              hospital_id: chosenDoc.hospital_id,
              token_number: tokenVal,
              status: 'booked',
              queue_position: 1,
              estimated_wait_minutes: 5,
              symptoms_summary: `[EMERGENCY_PRIORITY] ${symptoms}`,
              created_at: nowIso,
              updated_at: nowIso,
            }).select('*, doctors(name, hospital_id, department_id), departments(name), hospitals(name), slots(slot_date, start_time)').single();

            if (!insertErr && insertedAppt) {
              const norm = normalizeAppointment(insertedAppt);
              norm.is_emergency = true;
              norm.qr_code = signedQr.qrString;
              norm.qr_reference = signedQr.qrString;
              norm.qr_data = signedQr.rawPayload;

              inMemoryDb.appointments.push(norm);

              return {
                success: true,
                is_emergency: true,
                appointment_id: apptId,
                id: apptId,
                token: tokenVal,
                token_number: tokenVal,
                queue_position: 1,
                estimated_wait_minutes: 5,
                appointment: norm,
                token_details: {
                  token_number: tokenVal,
                  appointment_id: apptId,
                  doctor: insertedAppt.doctors?.name || chosenDoc.name,
                  patient: patient_name || 'Patient',
                  department: insertedAppt.departments?.name || 'Emergency',
                  date: chosenSlot.slot_date,
                  is_emergency: true,
                },
                doctor: {
                  doctor_id: chosenDoc.id,
                  name: insertedAppt.doctors?.name || chosenDoc.name,
                  department_name: insertedAppt.departments?.name || 'Emergency',
                },
                slot: {
                  slot_id: chosenSlot.id,
                  date: chosenSlot.slot_date,
                  start_time: chosenSlot.start_time,
                },
                hospital: {
                  hospital_id: chosenDoc.hospital_id,
                  name: insertedAppt.hospitals?.name || 'Hospital',
                },
                qr_reference: signedQr.qrString,
                qr_code: signedQr.qrString,
                qr_data: signedQr.rawPayload,
              };
            }
          }
        }
      } catch (err) {
        console.warn('[db] Supabase bookEmergencyAppointmentAtomic direct insert error:', err.message);
      }
    }

    return inMemoryDb.bookEmergencyAppointmentAtomic({
      patient_id,
      department_id,
      department_name,
      hospital_id,
      patient_name,
      patient_phone,
      symptoms,
      correlation_id,
    });
  },


  async cancelAppointment(appointmentIdOrToken) {
    if (supabase) {
      try {
        const idStr = String(appointmentIdOrToken).trim();
        const cleanTok = idStr.replace(/^#/, '');
        let query = supabase.from('appointments').select('*');
        if (isUUID(idStr)) {
          query = query.or(`id.eq.${idStr},token_number.eq.${idStr}`);
        } else {
          query = query.or(`token_number.eq.${idStr},token_number.eq.#${cleanTok},token_number.eq.${cleanTok}`);
        }
        const { data: appt } = await query.maybeSingle();
        if (appt) {
          const inMem = inMemoryDb.appointments.find(a => a.id === appt.id || a.appointment_id === appt.id || a.token === appt.token_number || a.token_number === appt.token_number);
          if (inMem) {
            inMem.status = 'CANCELLED';
            inMem.queue_position = null;
          }

          const { data: updatedAppt, error: updateErr } = await supabase
            .from('appointments')
            .update({ status: 'cancelled', queue_position: null, updated_at: new Date().toISOString() })
            .eq('id', appt.id)
            .select()
            .single();

          if (appt.slot_id) {
            await supabase
              .from('slots')
              .update({ status: 'available' })
              .eq('id', appt.slot_id);
          }

          return normalizeAppointment(updatedAppt || appt);
        }
      } catch (err) {
        console.error('[db] Supabase cancelAppointment error:', err.message);
      }
    }
    return inMemoryDb.cancelAppointment(appointmentIdOrToken);
  },

  async releaseSlot(slotId) {
    if (!slotId) return;
    if (supabase) {
      try {
        await supabase.from('slots').update({ status: 'available' }).eq('id', slotId);
      } catch (err) {
        // ignore
      }
    }
    const slot = inMemoryDb.doctor_slots.find(s => s.slot_id === slotId || s.id === slotId);
    if (slot) slot.status = 'AVAILABLE';
  },

  async getPatientQueueMetrics(tokenIdOrApptId) {
    if (supabase) {
      try {
        let query = supabase.from('appointments').select('*, doctors(name), departments(name)');
        if (tokenIdOrApptId.startsWith('#') || tokenIdOrApptId.startsWith('MED-')) {
          query = query.eq('token_number', tokenIdOrApptId);
        } else {
          query = query.or(`id.eq.${tokenIdOrApptId},token_number.eq.${tokenIdOrApptId}`);
        }
        const { data: appt } = await query.maybeSingle();
        if (appt) {
          const { data: inConsultation } = await supabase
            .from('appointments')
            .select('token_number')
            .eq('doctor_id', appt.doctor_id)
            .eq('status', 'in_consultation')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const { count } = await supabase
            .from('appointments')
            .select('id', { count: 'exact', head: true })
            .eq('doctor_id', appt.doctor_id)
            .in('status', ['booked', 'checked_in'])
            .lt('created_at', appt.created_at);

          const peopleAhead = count || 0;
          const queuePos = appt.queue_position || (peopleAhead + 1);
          const estWait = appt.estimated_wait_minutes || (peopleAhead * 15);

          return {
            my_token: appt.token_number,
            current_token: inConsultation?.token_number || 'None',
            queue_position: queuePos,
            people_ahead: peopleAhead,
            estimated_wait_minutes: estWait,
            status: appt.status.toUpperCase(),
            doctor_name: appt.doctors?.name || 'Doctor',
            department_name: appt.departments?.name || 'OPD',
          };
        }
      } catch (err) {
        console.error('[db] Supabase getPatientQueueMetrics error:', err.message);
      }
    }
    return inMemoryDb.getPatientQueueMetrics(tokenIdOrApptId);
  },

  async getDues(patientIdOrPhone) {
    let consultationFee = 500;
    if (supabase) {
      try {
        const pt = await this.getPatientByPhone(patientIdOrPhone);
        if (pt) {
          const { data: dues } = await supabase
            .from('consultation_dues')
            .select('*')
            .eq('patient_id', pt.id)
            .eq('status', 'PENDING');
          if (dues && dues.length > 0) {
            const total = dues.reduce((acc, d) => acc + Number(d.balance_due || 0), 0);
            return { patientName: pt.name, totalDues: total, consultationFee };
          }
          return { patientName: pt.name, totalDues: 0, consultationFee };
        }
      } catch (err) {
        // Table might not exist yet, fallback gracefully
      }
    }
    return { patientName: 'Patient', totalDues: 0, consultationFee };
  },

  async getHospitalResources(hospital_id) {
    if (supabase) {
      try {
        let q = supabase.from('hospital_resources').select('*');
        if (hospital_id) q = q.eq('hospital_id', hospital_id);
        const { data, error } = await q;
        if (!error && data) return data;
      } catch (err) {
        console.warn('[db] getHospitalResources error:', err.message);
      }
    }
    return [];
  },

  async getEmergencyRequests(filters = {}) {
    if (supabase) {
      try {
        let q = supabase
          .from('emergency_requests')
          .select('*, requesting_hospital:hospitals!requesting_hospital_id(id, name, latitude, longitude, contact_phone), responding_hospital:hospitals!responding_hospital_id(id, name, latitude, longitude, contact_phone)')
          .order('created_at', { ascending: false });

        if (filters.status) q = q.eq('status', filters.status);
        if (filters.hospital_id || filters.hospitalId) {
          const hid = filters.hospital_id || filters.hospitalId;
          q = q.or(`requesting_hospital_id.eq.${hid},responding_hospital_id.eq.${hid}`);
        }
        const { data, error } = await q;
        if (!error && data) {
          return data.map(r => ({
            id: r.id,
            request_id: r.id,
            requesting_hospital_id: r.requesting_hospital_id,
            requesting_hospital_name: r.requesting_hospital?.name || 'Hospital',
            resource_type: r.resource_type,
            quantity: r.quantity,
            urgency: r.urgency,
            priority: r.urgency,
            status: r.status,
            notes: r.notes,
            timeout_at: r.timeout_at,
            expires_at: r.timeout_at,
            responding_hospital_id: r.responding_hospital_id,
            supplying_hospital_id: r.responding_hospital_id,
            supplying_hospital_name: r.responding_hospital?.name || null,
            locked_at: r.locked_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
          }));
        }
      } catch (err) {
        console.warn('[db] getEmergencyRequests error:', err.message);
      }
    }
    return inMemoryDb.emergency_requests || [];
  },

  async createEmergencyRequest({ requesting_hospital_id, resource_type, quantity, urgency, notes }) {
    let normalizedResource = (resource_type || 'BLOOD_O_NEG').toUpperCase();
    if (normalizedResource.includes('BLOOD') || normalizedResource.includes('O_NEG')) {
      normalizedResource = 'BLOOD_O_NEG';
    } else if (normalizedResource.includes('OXYGEN')) {
      normalizedResource = 'OXYGEN_CYLINDER';
    } else if (normalizedResource.includes('ICU')) {
      normalizedResource = 'ICU_BED';
    } else if (normalizedResource.includes('VENTILATOR')) {
      normalizedResource = 'VENTILATOR';
    } else if (normalizedResource.includes('AMBULANCE')) {
      normalizedResource = 'AMBULANCE';
    }

    if (supabase) {
      try {
        const timeout = new Date(Date.now() + 180 * 1000).toISOString();
        const { data, error } = await supabase.from('emergency_requests').insert([{
          requesting_hospital_id,
          resource_type: normalizedResource,
          quantity: quantity || 1,
          urgency: urgency || 'CRITICAL',
          status: 'CREATED',
          notes,
          timeout_at: timeout,
        }]).select('*, requesting_hospital:hospitals!requesting_hospital_id(id, name)').single();

        if (!error && data) {
          const hospitals = await this.getHospitals();
          return {
            success: true,
            request: {
              ...data,
              request_id: data.id,
              requesting_hospital_name: data.requesting_hospital?.name || 'Hospital',
              priority: data.urgency,
              expires_at: data.timeout_at,
            },
            matches: hospitals.filter(h => h.id !== requesting_hospital_id),
          };
        } else if (error) {
          console.warn('[db] Supabase createEmergencyRequest error:', error.message);
        }
      } catch (err) {
        console.warn('[db] Error creating emergency request in Supabase:', err.message);
      }
    }
    return inMemoryDb.createEmergencyRequest({ requesting_hospital_id, resource_type: normalizedResource, quantity, urgency, notes });
  },

  async acceptEmergencyRequest({ request_id, supplying_hospital_id, supplying_hospital_name }) {
    if (supabase) {
      try {
        // 1. Fetch request
        const { data: req, error: reqErr } = await supabase
          .from('emergency_requests')
          .select('*, requesting_hospital:hospitals!requesting_hospital_id(id, name)')
          .eq('id', request_id)
          .single();

        if (reqErr || !req) {
          return { success: false, error: 'REQUEST_NOT_FOUND', message: 'Emergency request not found' };
        }

        // Guard: Requesting hospital cannot accept its own request
        if (req.requesting_hospital_id === supplying_hospital_id) {
          return { success: false, error: 'SELF_SUPPLY_NOT_ALLOWED', message: 'Requesting hospital cannot accept its own emergency requisition.' };
        }

        if (req.status !== 'CREATED' && req.status !== 'BROADCASTED') {
          return { success: false, error: 'REQUEST_ALREADY_ACCEPTED', message: 'This emergency request has already been accepted or resolved.' };
        }

        // 2. Check and lock resource inventory
        const { data: resRow } = await supabase
          .from('hospital_resources')
          .select('*')
          .eq('hospital_id', supplying_hospital_id)
          .eq('resource_type', req.resource_type)
          .maybeSingle();

        if (resRow && resRow.available_quantity < req.quantity) {
          return { success: false, error: 'INSUFFICIENT_INVENTORY', message: `Supplying hospital only has ${resRow.available_quantity} available, but ${req.quantity} requested.` };
        }

        if (resRow) {
          await supabase
            .from('hospital_resources')
            .update({
              available_quantity: Math.max(0, resRow.available_quantity - req.quantity),
              updated_at: new Date().toISOString(),
            })
            .eq('id', resRow.id);
        }

        // 3. Update emergency request status
        const now = new Date().toISOString();
        const { data: updatedReq, error: updateErr } = await supabase
          .from('emergency_requests')
          .update({
            status: 'ACCEPTED',
            responding_hospital_id: supplying_hospital_id,
            locked_at: now,
            updated_at: now,
          })
          .eq('id', request_id)
          .select('*, requesting_hospital:hospitals!requesting_hospital_id(id, name), responding_hospital:hospitals!responding_hospital_id(id, name)')
          .single();

        if (updateErr) {
          return { success: false, error: 'UPDATE_FAILED', message: updateErr.message };
        }

        // 4. Generate signed single-use dispatch QR pass
        const dispatchId = `DISP-${Math.floor(100000 + Math.random() * 900000)}`;
        const signedPass = generateSignedDispatchQR({
          dispatch_id: dispatchId,
          request_id: request_id,
          donor_hospital_id: supplying_hospital_id,
          requester_hospital_id: req.requesting_hospital_id,
          resource_type: req.resource_type,
          quantity: req.quantity,
        });

        return {
          success: true,
          dispatch_id: dispatchId,
          qr_token_hash: signedPass.token || signedPass.sig,
          qr_code: signedPass.qrString,
          request: {
            ...updatedReq,
            request_id: updatedReq.id,
            requesting_hospital_name: updatedReq.requesting_hospital?.name || 'Hospital',
            supplying_hospital_id,
            supplying_hospital_name: updatedReq.responding_hospital?.name || supplying_hospital_name || 'Hospital',
            dispatch_id: dispatchId,
          },
          message: 'Emergency request accepted and inventory allocated successfully.',
        };
      } catch (err) {
        console.error('[db] acceptEmergencyRequest error:', err);
        return { success: false, error: 'ACCEPT_FAILED', message: err.message };
      }
    }
    return inMemoryDb.acceptEmergencyRequest({ request_id, supplying_hospital_id, supplying_hospital_name });
  },

  async verifyAndCheckInAppointment({ qrData, tokenId, appointmentId, action = 'verify', user = null }) {
    let resolvedToken = tokenId;
    let resolvedAppointmentId = appointmentId;

    // 1. If qrData is provided, cryptographically verify payload first
    if (qrData) {
      const qrCheck = verifyQRPayload(qrData);
      if (qrCheck.isRawToken) {
        resolvedToken = qrCheck.token;
      } else if (!qrCheck.valid) {
        return {
          success: false,
          status: qrCheck.status || 'INVALID',
          code: qrCheck.error || 'INVALID_QR',
          message: qrCheck.status === 'EXPIRED'
            ? 'This appointment QR pass has expired.'
            : 'Cryptographic QR verification failed: Pass is forged, corrupted, or tampered.',
        };
      } else {
        // Valid cryptographic signature
        resolvedToken = qrCheck.data.token;
        resolvedAppointmentId = qrCheck.data.id;
      }
    }

    // 2. Validate against live database
    if (supabase) {
      try {
        let query = supabase.from('appointments').select('*, doctors(name, hospital_id, departments(name)), departments(name), patients(full_name, phone_number), slots(slot_date, start_time)');
        if (resolvedAppointmentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resolvedAppointmentId)) {
          query = query.eq('id', resolvedAppointmentId);
        } else if (resolvedToken) {
          const cleanTok = resolvedToken.replace('#', '');
          query = query.or(`token_number.eq.${resolvedToken},token_number.eq.#${cleanTok},token_number.eq.${cleanTok}`);
        }
        const { data: appt, error: apptErr } = await query.maybeSingle();
        if (!apptErr && appt) {
          const apptStatus = (appt.status || 'BOOKED').toUpperCase();
          const docName = appt.doctors?.name || 'Assigned Doctor';
          const deptName = appt.departments?.name || appt.doctors?.departments?.name || 'General OPD';
          const hospName = 'All India Institute of Medical Sciences (AIIMS) New Delhi';
          const patName = appt.patients?.full_name || appt.patients?.name || 'Patient';
          const patPhone = appt.patients?.phone_number || appt.patients?.phone || '';

          // Check authorization: if authenticated as a patient, must own the appointment
          if (user && user.role === 'patient') {
            const isOwner = (user.id && (user.id === appt.patient_id || user.id === appt.patients?.id)) ||
                            (user.phone && (user.phone === patPhone || (patPhone && (patPhone.endsWith(user.phone.slice(-10)) || user.phone.endsWith(patPhone.slice(-10))))));
            if (!isOwner) {
              return {
                success: false,
                status: 'FORBIDDEN',
                code: 'UNAUTHORIZED_ACCESS',
                message: 'Access denied: You are not authorized to view or verify another patient’s appointment pass.',
              };
            }
          }

          const isStaff = user && ['hospital', 'receptionist', 'doctor', 'admin'].includes(user.role?.toLowerCase());
          const isOwner = user && ((user.id && (user.id === appt.patient_id || user.id === appt.patients?.id)) || (user.phone && (user.phone === patPhone || (patPhone && (patPhone.endsWith(user.phone.slice(-10)) || user.phone.endsWith(patPhone.slice(-10)))))));
          const permittedPatientName = (isStaff || isOwner) ? patName : `${patName.slice(0, 1)}***`;
          const permittedPatientPhone = (isStaff || isOwner) ? patPhone : (patPhone ? `+91 ******${patPhone.slice(-4)}` : '');

          const apptDetails = {
            appointment_id: appt.id,
            token: appt.token_number,
            doctor_name: docName,
            department_name: deptName,
            hospital_name: hospName,
            appointment_date: appt.slots?.slot_date || (appt.created_at ? appt.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
            appointment_time: appt.slots?.start_time ? formatTo12Hour(appt.slots.start_time) : (appt.appointment_time || '10:00 AM'),
            status: apptStatus,
            queue_position: appt.queue_position || 1,
            estimated_wait_minutes: appt.estimated_wait_minutes || 15,
            patient_name: permittedPatientName,
            patient_phone: permittedPatientPhone,
          };

          if (apptStatus === 'CANCELLED') {
            return {
              success: false,
              status: 'CANCELLED',
              code: 'APPOINTMENT_CANCELLED',
              message: 'This appointment was cancelled and cannot be used for check-in.',
              appointment: apptDetails,
            };
          }

          if (['CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED'].includes(apptStatus)) {
            return {
              success: false,
              status: 'ALREADY USED / CHECKED IN',
              code: 'ALREADY_CHECKED_IN',
              message: `Patient has already checked in with this QR token (Status: ${apptStatus}).`,
              appointment: apptDetails,
              queue_position: appt.queue_position || 1,
            };
          }

          if (action === 'check_in') {
            const nowIso = new Date().toISOString();

            // Count real waiting patients for this doctor in Supabase
            let waitingCount = 0;
            try {
              const { count, error: cErr } = await supabase
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('doctor_id', appt.doctor_id)
                .eq('status', 'checked_in');
              if (!cErr && typeof count === 'number') {
                waitingCount = count;
              }
            } catch {
              // ignore
            }
            if (waitingCount === 0) {
              waitingCount = inMemoryDb.queue_entries.filter(q => q.status === 'WAITING').length || 0;
            }

            const isEmergency = (appt.token_number || '').startsWith('#EMERG-') ||
              (appt.symptoms_summary || '').includes('EMERGENCY') ||
              Boolean(appt.is_emergency);
            const newPos = isEmergency ? 1 : (waitingCount + 1);
            const estWait = isEmergency ? 5 : ((newPos - 1) * 15);

            await supabase.from('appointments').update({
              status: 'checked_in',
              check_in_time: nowIso,
              queue_position: newPos,
              estimated_wait_minutes: estWait,
              updated_at: nowIso,
            }).eq('id', appt.id);

            apptDetails.status = 'CHECKED_IN';
            apptDetails.queue_position = newPos;
            apptDetails.estimated_wait_minutes = estWait;

            // Also mirror in inMemoryDb queue (avoid duplicates)
            inMemoryDb.queue_entries = inMemoryDb.queue_entries.filter(q => q.appointment_id !== appt.id && q.token !== appt.token_number);
            inMemoryDb.queue_entries.push({
              queue_id: randomUUID(),
              appointment_id: appt.id,
              patient_id: appt.patient_id,
              hospital_id: appt.hospital_id || appt.doctors?.hospital_id,
              doctor_id: appt.doctor_id,
              token: appt.token_number,
              token_number: appt.token_number,
              position: newPos,
              status: 'WAITING',
              check_in_at: nowIso,
            });

            // Update in inMemoryDb appointments if present
            const inMem = inMemoryDb.appointments.find(a => a.id === appt.id || a.appointment_id === appt.id || a.token === appt.token_number || a.token_number === appt.token_number);
            if (inMem) {
              inMem.status = 'CHECKED_IN';
              inMem.queue_position = newPos;
              inMem.check_in_time = nowIso;
            }

            return {
              success: true,
              verified: true,
              token: apptDetails.token,
              status: 'VALID',
              code: 'CHECK_IN_SUCCESSFUL',
              action_performed: 'CHECKED_IN',
              message: `Check-in verified successfully. Patient ${apptDetails.patient_name} enqueued at position ${newPos}.`,
              appointment: apptDetails,
              queue_position: newPos,
              estimated_wait_minutes: (newPos - 1) * 15,
              verified_at: new Date().toISOString(),
            };
          }

          return {
            success: true,
            verified: true,
            token: apptDetails.token,
            status: 'VALID',
            code: 'QR_VALID',
            can_check_in: true,
            message: 'QR pass is valid and ready for check-in.',
            appointment: apptDetails,
            verified_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        console.warn('[db] Supabase verify query error, using in-memory store:', err.message);
      }
    }

    return inMemoryDb.verifyAndCheckInAppointment({
      tokenId: resolvedToken,
      appointmentId: resolvedAppointmentId,
      action,
      user,
    });
  },

  async verifyAndRedeemDispatchPass({ qrData, dispatchId, tokenHash, action = 'verify', user = null }) {
    let resolvedDispatchId = dispatchId;
    let resolvedTokenHash = tokenHash;

    if (qrData) {
      const qrCheck = verifyQRPayload(qrData);
      if (!qrCheck.valid && !qrCheck.isRawToken) {
        return {
          success: false,
          status: qrCheck.status || 'INVALID',
          code: qrCheck.error || 'INVALID_QR',
          message: qrCheck.status === 'EXPIRED'
            ? 'Emergency dispatch pass has expired.'
            : 'Cryptographic QR verification failed: Pass signature is invalid or tampered.',
        };
      }
      if (qrCheck.valid) {
        resolvedDispatchId = qrCheck.data.id;
        resolvedTokenHash = qrCheck.data.token;
      }
    }

    return inMemoryDb.verifyAndRedeemDispatchPass({
      dispatchId: resolvedDispatchId,
      tokenHash: resolvedTokenHash,
      action,
      user,
    });
  },
};

export default db;

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Load environment variables if not present
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
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
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
    status: (s.status || 'available').toUpperCase() === 'AVAILABLE' ? 'AVAILABLE' : (s.status || 'AVAILABLE'),
  };
}

export function normalizeAppointment(appt) {
  if (!appt) return null;
  const id = appt.id || appt.appointment_id;
  const token = appt.token_number || appt.token;
  return {
    ...appt,
    appointment_id: id,
    id,
    token,
    token_number: token,
    patient_id: appt.patient_id,
    doctor_id: appt.doctor_id,
    hospital_id: appt.hospital_id,
    department_id: appt.department_id,
    slot_id: appt.slot_id,
    status: (appt.status || 'booked').toUpperCase(),
    queue_position: appt.queue_position || 1,
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

  getDoctorSlots(doctorId, date) {
    return this.doctor_slots.filter(s =>
      s.doctor_id === doctorId &&
      (!date || s.date === date || s.slot_date === date) &&
      s.status === 'AVAILABLE'
    );
  }

  calculateAvailableSlots(doctorId, date) {
    const slots = this.getDoctorSlots(doctorId, date);
    return slots.map(s => s.display_time);
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

  getAppointmentById(id) {
    return this.appointments.find(a => a.appointment_id === id || a.id === id || a.token === id || a.token_number === id);
  }

  bookAppointmentAtomic({ patient_id, doctor_id, department_id, slot_id, token, qr_ref }) {
    const slot = this.doctor_slots.find(s => (s.slot_id === slot_id || s.id === slot_id) && s.status === 'AVAILABLE');
    if (!slot) {
      throw new Error('This time slot has already been booked. Please select another slot.');
    }

    slot.status = 'BOOKED';

    const apptId = randomUUID();
    const tokenVal = token || `#MED-${Math.floor(1000 + Math.random() * 9000)}`;
    const qrVal = qr_ref || `qr_${randomUUID().slice(0, 8)}`;

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
      queue_position: 1,
      estimated_wait_minutes: 15,
      appointment: appt,
    };
  }

  cancelAppointment(idOrToken) {
    const appt = this.appointments.find(a => a.appointment_id === idOrToken || a.id === idOrToken || a.token === idOrToken || a.token_number === idOrToken);
    if (!appt) throw new Error('Appointment not found');

    appt.status = 'CANCELLED';
    const slot = this.doctor_slots.find(s => s.slot_id === appt.slot_id || s.id === appt.slot_id);
    if (slot) slot.status = 'AVAILABLE';

    return appt;
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

  async getDoctorSlots(doctorId, date) {
    if (supabase) {
      try {
        let query = supabase
          .from('slots')
          .select('*')
          .eq('doctor_id', doctorId)
          .eq('status', 'available');

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
    return inMemoryDb.getDoctorSlots(doctorId, date);
  },

  async calculateAvailableSlots(doctorId, date) {
    const slots = await this.getDoctorSlots(doctorId, date);
    if (!slots || slots.length === 0) {
      return inMemoryDb.calculateAvailableSlots(doctorId, date);
    }
    return slots.map(s => s.display_time);
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
        let q = supabase.from('appointments').select('*, doctors(name), departments(name), slots(slot_date, start_time)');
        if (filter.hospital_id) q = q.eq('hospital_id', filter.hospital_id);
        if (filter.doctor_id) q = q.eq('doctor_id', filter.doctor_id);
        if (filter.patient_id) q = q.eq('patient_id', filter.patient_id);
        if (filter.status) q = q.eq('status', filter.status.toLowerCase());
        const { data, error } = await q.order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          return data.map(normalizeAppointment);
        }
      } catch (err) {
        console.warn('[db] Error fetching real appointments, using in-memory store:', err.message);
      }
    }
    return inMemoryDb.getAppointments(filter);
  },

  async getAppointmentById(appointmentId) {
    if (supabase) {
      try {
        let query = supabase.from('appointments').select('*, doctors(name), departments(name), slots(slot_date, start_time)');
        if (appointmentId.startsWith('#') || appointmentId.startsWith('MED-')) {
          query = query.eq('token_number', appointmentId);
        } else {
          query = query.or(`id.eq.${appointmentId},token_number.eq.${appointmentId}`);
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
            // Fetch booked appointment record
            const { data: apptRecord } = await supabase
              .from('appointments')
              .select('*, doctors(name), departments(name), slots(slot_date, start_time)')
              .eq('id', data.appointment_id)
              .maybeSingle();

            const tokenVal = data.token_number;
            return {
              success: true,
              appointment_id: data.appointment_id,
              id: data.appointment_id,
              token: tokenVal,
              token_number: tokenVal,
              qr_reference: data.qr_token_hash,
              queue_position: data.queue_position || 1,
              estimated_wait_minutes: data.estimated_wait_minutes || 15,
              appointment: apptRecord ? normalizeAppointment(apptRecord) : {
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
              },
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

  async cancelAppointment(appointmentIdOrToken) {
    if (supabase) {
      try {
        let query = supabase.from('appointments').select('*');
        if (appointmentIdOrToken.startsWith('#') || appointmentIdOrToken.startsWith('MED-')) {
          query = query.eq('token_number', appointmentIdOrToken);
        } else {
          query = query.or(`id.eq.${appointmentIdOrToken},token_number.eq.${appointmentIdOrToken}`);
        }
        const { data: appt } = await query.maybeSingle();
        if (appt) {
          const { data: updatedAppt, error: updateErr } = await supabase
            .from('appointments')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
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

  async createEmergencyRequest({ requesting_hospital_id, resource_type, quantity, urgency, notes }) {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('emergency_requests').insert([{
          requesting_hospital_id,
          resource_type,
          quantity: quantity || 1,
          urgency: urgency || 'CRITICAL',
          status: 'BROADCASTED',
          notes,
        }]).select().single();
        if (!error && data) {
          const hospitals = await this.getHospitals();
          return { success: true, request: data, matches: hospitals.filter(h => h.id !== requesting_hospital_id) };
        }
      } catch (err) {
        console.warn('[db] Error creating emergency request in Supabase:', err.message);
      }
    }
    return inMemoryDb.createEmergencyRequest({ requesting_hospital_id, resource_type, quantity, urgency, notes });
  },
};

export default db;

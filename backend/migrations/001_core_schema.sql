-- ============================================================================
-- MedConnect Pulse — Database Migration 001: Core Schema
-- Description: Core entities for hospitals, users, patients, doctors, slots,
--              appointments, live queue entries, and workflow audit logs.
-- ============================================================================

-- Enable pgcrypto for UUID generation if not already active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM (
      'PATIENT',
      'RECEPTIONIST',
      'DOCTOR',
      'EMERGENCY_MANAGER',
      'ADMIN'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
    CREATE TYPE appointment_status AS ENUM (
      'BOOKED',
      'CHECKED_IN',
      'IN_CONSULTATION',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'queue_status') THEN
    CREATE TYPE queue_status AS ENUM (
      'WAITING',
      'CALLED',
      'IN_CONSULTATION',
      'COMPLETED',
      'SKIPPED'
    );
  END IF;
END $$;

-- ============================================================================
-- 2. CORE TABLES
-- ============================================================================

-- Hospitals: Healthcare facilities in the network
CREATE TABLE IF NOT EXISTS hospitals (
  hospital_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  latitude NUMERIC(9,6) NOT NULL,
  longitude NUMERIC(9,6) NOT NULL,
  contact TEXT,
  telegram_chat_id TEXT,
  active_status BOOLEAN DEFAULT true,
  verification_status TEXT DEFAULT 'VERIFIED',
  supported_resource_categories TEXT[] DEFAULT ARRAY['BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'MEDICINE', 'EQUIPMENT', 'AMBULANCE'],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Users: Hospital staff, doctors, admins, and registered patients
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID REFERENCES hospitals(hospital_id) ON DELETE SET NULL,
  role user_role NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Patients: Patient demographics and consent tracking
CREATE TABLE IF NOT EXISTS patients (
  patient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  consent_status BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Departments: Hospital medical departments (Cardiology, Orthopedics, etc.)
CREATE TABLE IF NOT EXISTS departments (
  department_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT
);

-- Doctors: Practitioners attached to a hospital and department
CREATE TABLE IF NOT EXISTS doctors (
  doctor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(department_id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  active_status BOOLEAN DEFAULT true
);

-- Doctor Slots: Individual schedulable appointment blocks
CREATE TABLE IF NOT EXISTS doctor_slots (
  slot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES doctors(doctor_id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'AVAILABLE',
  locked_until TIMESTAMPTZ
);

-- Appointments: Confirmed bookings with unique token and QR reference
CREATE TABLE IF NOT EXISTS appointments (
  appointment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES doctors(doctor_id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(department_id) ON DELETE SET NULL,
  slot_id UUID REFERENCES doctor_slots(slot_id) ON DELETE SET NULL,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  qr_reference TEXT NOT NULL,
  status appointment_status DEFAULT 'BOOKED',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Queue Entries: Live OPD waiting queue populated upon QR check-in
CREATE TABLE IF NOT EXISTS queue_entries (
  queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES doctors(doctor_id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  position INT NOT NULL,
  check_in_at TIMESTAMPTZ DEFAULT now(),
  status queue_status DEFAULT 'WAITING'
);

-- Audit Logs: High-fidelity immutable event stream for all operational workflows
CREATE TABLE IF NOT EXISTS audit_logs (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  record_id UUID,
  correlation_id UUID,
  timestamp TIMESTAMPTZ DEFAULT now(),
  details JSONB
);

-- ============================================================================
-- 3. INDEXES FOR HIGH-THROUGHPUT QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_hospital ON users(hospital_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_doctors_hospital_dept ON doctors(hospital_id, department_id);
CREATE INDEX IF NOT EXISTS idx_doctor_slots_doctor_time ON doctor_slots(doctor_id, start_time);
CREATE INDEX IF NOT EXISTS idx_doctor_slots_status ON doctor_slots(status);
CREATE INDEX IF NOT EXISTS idx_appointments_token ON appointments(token);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_queue_entries_doctor_status ON queue_entries(doctor_id, status, position);
CREATE INDEX IF NOT EXISTS idx_queue_entries_appointment ON queue_entries(appointment_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workflow_time ON audit_logs(workflow, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id);

-- ============================================================================
-- 4. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active hospitals and departments for directory and booking UI
DROP POLICY IF EXISTS "Public read hospitals" ON hospitals;
CREATE POLICY "Public read hospitals" ON hospitals FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read departments" ON departments;
CREATE POLICY "Public read departments" ON departments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read doctors" ON doctors;
CREATE POLICY "Public read doctors" ON doctors FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read slots" ON doctor_slots;
CREATE POLICY "Public read slots" ON doctor_slots FOR SELECT USING (true);

-- Allow authenticated and service role full access
DROP POLICY IF EXISTS "Service role full access hospitals" ON hospitals;
CREATE POLICY "Service role full access hospitals" ON hospitals USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access users" ON users;
CREATE POLICY "Service role full access users" ON users USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access patients" ON patients;
CREATE POLICY "Service role full access patients" ON patients USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access departments" ON departments;
CREATE POLICY "Service role full access departments" ON departments USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access doctors" ON doctors;
CREATE POLICY "Service role full access doctors" ON doctors USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access slots" ON doctor_slots;
CREATE POLICY "Service role full access slots" ON doctor_slots USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access appointments" ON appointments;
CREATE POLICY "Service role full access appointments" ON appointments USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access queue_entries" ON queue_entries;
CREATE POLICY "Service role full access queue_entries" ON queue_entries USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access audit_logs" ON audit_logs;
CREATE POLICY "Service role full access audit_logs" ON audit_logs USING (true) WITH CHECK (true);

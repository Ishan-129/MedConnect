-- ============================================================================
-- MedConnect Pulse — Database Migration 003: AI Receptionist Schema Extensions
-- Description: Extends core schema for AI Receptionist real data integration,
--              including consultation fees, live queue calculation, billing dues,
--              and slot availability performance indexes.
-- ============================================================================

-- 1. Extend Doctors Table with consultation fees & scheduling metadata
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doctors') THEN
    ALTER TABLE doctors ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC(10,2) DEFAULT 500.00;
    ALTER TABLE doctors ADD COLUMN IF NOT EXISTS consultation_duration_minutes INT DEFAULT 15;
    ALTER TABLE doctors ADD COLUMN IF NOT EXISTS available_days TEXT[] DEFAULT ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  END IF;
END $$;

-- 2. Extend Hospitals Table with emergency helpline & verification fields
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hospitals') THEN
    ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS emergency_contact TEXT DEFAULT '102 / +91-11-26594405';
    ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'VERIFIED';
    ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS supported_resource_categories TEXT[] DEFAULT ARRAY['BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'MEDICINE', 'EQUIPMENT', 'AMBULANCE'];
  END IF;
END $$;

-- 3. Patient Consultation Dues / Billing Ledger Table
CREATE TABLE IF NOT EXISTS consultation_dues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  hospital_id UUID REFERENCES hospitals(id) ON DELETE CASCADE,
  consultation_fee NUMERIC(10,2) NOT NULL DEFAULT 500.00,
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  balance_due NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'CLEARED' CHECK (status IN ('CLEARED', 'PENDING', 'OVERDUE', 'WAIVED')),
  notes TEXT,
  due_date DATE DEFAULT (CURRENT_DATE + interval '7 days'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. High-Performance Indexes for Slot Availability & Multi-turn Lookups
CREATE INDEX IF NOT EXISTS idx_slots_doctor_date_status ON slots(doctor_id, slot_date, status);
CREATE INDEX IF NOT EXISTS idx_slots_hospital_date ON slots(hospital_id, slot_date, status);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_status ON appointments(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_token_number ON appointments(token_number);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date ON appointments(doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_phone_number ON patients(phone_number);
CREATE INDEX IF NOT EXISTS idx_consultation_dues_patient ON consultation_dues(patient_id, status);

-- 5. Helper Function: Cancel Appointment and Restore Slot Status
CREATE OR REPLACE FUNCTION cancel_appointment_and_restore_slot(p_appointment_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_slot_id UUID;
  v_appt_record RECORD;
BEGIN
  SELECT * INTO v_appt_record FROM appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Appointment not found');
  END IF;

  UPDATE appointments
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_appointment_id;

  IF v_appt_record.slot_id IS NOT NULL THEN
    UPDATE slots
    SET status = 'available', version = version + 1
    WHERE id = v_appt_record.slot_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', p_appointment_id,
    'status', 'cancelled',
    'slot_id', v_appt_record.slot_id
  );
END;
$$ LANGUAGE plpgsql;

-- 6. Helper Function: Compute Realtime Queue Metrics for Token
CREATE OR REPLACE FUNCTION get_realtime_queue_metrics(p_token_number TEXT)
RETURNS JSONB AS $$
DECLARE
  v_appt RECORD;
  v_current_in_consultation RECORD;
  v_people_ahead INT;
  v_pos INT;
  v_est_wait INT;
BEGIN
  SELECT a.*, d.name as doctor_name, dep.name as department_name
  INTO v_appt
  FROM appointments a
  LEFT JOIN doctors d ON d.id = a.doctor_id
  LEFT JOIN departments dep ON dep.id = a.department_id
  WHERE a.token_number = p_token_number;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token not found');
  END IF;

  -- Active token currently in consultation for doctor
  SELECT token_number INTO v_current_in_consultation
  FROM appointments
  WHERE doctor_id = v_appt.doctor_id
    AND status = 'in_consultation'
  ORDER BY updated_at DESC LIMIT 1;

  -- Count people ahead in booked / checked_in states with created_at < current
  SELECT COUNT(*) INTO v_people_ahead
  FROM appointments
  WHERE doctor_id = v_appt.doctor_id
    AND status IN ('booked', 'checked_in')
    AND created_at < v_appt.created_at;

  v_pos := v_people_ahead + 1;
  v_est_wait := v_people_ahead * 15;

  RETURN jsonb_build_object(
    'success', true,
    'my_token', v_appt.token_number,
    'current_token', COALESCE(v_current_in_consultation.token_number, 'None'),
    'queue_position', v_pos,
    'people_ahead', v_people_ahead,
    'estimated_wait_minutes', v_est_wait,
    'status', v_appt.status,
    'doctor_name', v_appt.doctor_name,
    'department_name', v_appt.department_name
  );
END;
$$ LANGUAGE plpgsql STABLE;

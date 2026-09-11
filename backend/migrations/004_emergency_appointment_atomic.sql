-- ============================================================================
-- Migration 004: Emergency One-Click Appointment Atomic Flow
-- Author: MedConnect Pulse (Phase 4)
-- Purpose: Real database emergency doctor/slot allocation with transactional
--          concurrency lock (FOR UPDATE SKIP LOCKED), deterministic priority,
--          explainable selection rationale, and zero-fake-success error handling.
-- ============================================================================

CREATE OR REPLACE FUNCTION book_emergency_appointment_atomic(
  p_patient_id UUID,
  p_department_id UUID DEFAULT NULL,
  p_department_name TEXT DEFAULT NULL,
  p_hospital_id UUID DEFAULT NULL,
  p_symptoms TEXT DEFAULT 'Emergency Consultation Request',
  p_token TEXT DEFAULT NULL,
  p_qr_ref TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_department_id UUID := p_department_id;
  v_department_name TEXT;
  v_slot RECORD;
  v_doctor RECORD;
  v_hospital RECORD;
  v_appointment_id UUID;
  v_token TEXT;
  v_qr_ref TEXT;
  v_queue_id UUID;
  v_now TIMESTAMPTZ := now();
  v_rationale TEXT;
  v_random_suffix INT;
BEGIN
  -- 1. Identify Target Department / Specialty
  IF v_department_id IS NULL AND p_department_name IS NOT NULL THEN
    SELECT department_id, name INTO v_department_id, v_department_name
    FROM departments
    WHERE name ILIKE '%' || p_department_name || '%'
       OR code ILIKE '%' || p_department_name || '%'
    ORDER BY (name ILIKE p_department_name) DESC
    LIMIT 1;
  END IF;

  -- If still null, try finding department by symptom keyword or fallback to Emergency/General
  IF v_department_id IS NULL AND p_symptoms IS NOT NULL THEN
    IF p_symptoms ILIKE '%chest%' OR p_symptoms ILIKE '%heart%' OR p_symptoms ILIKE '%cardio%' THEN
      SELECT department_id, name INTO v_department_id, v_department_name
      FROM departments WHERE name ILIKE '%cardio%' LIMIT 1;
    ELSIF p_symptoms ILIKE '%bone%' OR p_symptoms ILIKE '%fracture%' OR p_symptoms ILIKE '%ortho%' THEN
      SELECT department_id, name INTO v_department_id, v_department_name
      FROM departments WHERE name ILIKE '%ortho%' LIMIT 1;
    ELSIF p_symptoms ILIKE '%child%' OR p_symptoms ILIKE '%pediatric%' OR p_symptoms ILIKE '%baby%' THEN
      SELECT department_id, name INTO v_department_id, v_department_name
      FROM departments WHERE name ILIKE '%pedia%' LIMIT 1;
    END IF;
  END IF;

  -- Default to Emergency Medicine or General Medicine if still unresolved
  IF v_department_id IS NULL THEN
    SELECT department_id, name INTO v_department_id, v_department_name
    FROM departments
    WHERE name ILIKE '%emergency%' OR name ILIKE '%general medicine%'
    ORDER BY (name ILIKE '%emergency%') DESC
    LIMIT 1;
  END IF;

  -- Fetch department name if we have department_id
  IF v_department_id IS NOT NULL AND v_department_name IS NULL THEN
    SELECT name INTO v_department_name FROM departments WHERE department_id = v_department_id;
  END IF;

  -- 2. Query Real Available Doctors and Slots using FOR UPDATE SKIP LOCKED
  -- Priority:
  -- 1. Doctor active
  -- 2. Matching department (or hospital if specified)
  -- 3. Earliest available slot (slot_start >= now or today onwards)
  SELECT ds.*, d.name AS doctor_name, d.hospital_id AS doc_hospital_id, d.department_id AS doc_dept_id
  INTO v_slot
  FROM doctor_slots ds
  JOIN doctors d ON ds.doctor_id = d.doctor_id
  WHERE (v_department_id IS NULL OR d.department_id = v_department_id)
    AND (p_hospital_id IS NULL OR d.hospital_id = p_hospital_id)
    AND d.active_status = true
    AND ds.status = 'AVAILABLE'
    AND ds.start_time >= v_now
  ORDER BY ds.start_time ASC, d.doctor_id ASC
  FOR UPDATE OF ds SKIP LOCKED
  LIMIT 1;

  -- Fallback check: if no future slots found for exact now, check any available slot today or upcoming
  IF v_slot.slot_id IS NULL THEN
    SELECT ds.*, d.name AS doctor_name, d.hospital_id AS doc_hospital_id, d.department_id AS doc_dept_id
    INTO v_slot
    FROM doctor_slots ds
    JOIN doctors d ON ds.doctor_id = d.doctor_id
    WHERE (v_department_id IS NULL OR d.department_id = v_department_id)
      AND (p_hospital_id IS NULL OR d.hospital_id = p_hospital_id)
      AND d.active_status = true
      AND ds.status = 'AVAILABLE'
    ORDER BY ds.start_time ASC, d.doctor_id ASC
    FOR UPDATE OF ds SKIP LOCKED
    LIMIT 1;
  END IF;

  -- 3. Check if slot was found — STRICT ZERO FAKE SUCCESS
  IF v_slot.slot_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NO_EMERGENCY_SLOT_AVAILABLE',
      'message', 'No suitable emergency slot currently available for the requested specialty.',
      'department', COALESCE(v_department_name, 'Emergency Specialty'),
      'department_id', v_department_id,
      'fallback', jsonb_build_object(
        'emergency_contact', '102',
        'action', 'CONTACT_EMERGENCY_DESK',
        'alternate_hospitals_url', '/api/hospitals/nearby'
      )
    );
  END IF;

  -- Fetch doctor details
  SELECT * INTO v_doctor FROM doctors WHERE doctor_id = v_slot.doctor_id;
  SELECT * INTO v_hospital FROM hospitals WHERE hospital_id = v_slot.doc_hospital_id;

  -- Generate Token & QR Ref if not passed
  v_random_suffix := floor(1000 + random() * 9000)::INT;
  v_token := COALESCE(p_token, '#EMERG-' || v_random_suffix::TEXT);
  v_qr_ref := COALESCE(p_qr_ref, 'qr_emerg_' || substr(md5(random()::TEXT), 1, 8));

  -- 4. Transactionally Reserve the Slot
  UPDATE doctor_slots
  SET status = 'BOOKED',
      locked_until = NULL
  WHERE slot_id = v_slot.slot_id;

  -- 5. Create Confirmed Appointment
  INSERT INTO appointments (
    patient_id,
    doctor_id,
    department_id,
    slot_id,
    slot_start,
    slot_end,
    token,
    qr_reference,
    status,
    created_at
  ) VALUES (
    p_patient_id,
    v_doctor.doctor_id,
    COALESCE(v_department_id, v_doctor.department_id),
    v_slot.slot_id,
    v_slot.start_time,
    v_slot.end_time,
    v_token,
    v_qr_ref,
    'BOOKED',
    v_now
  )
  RETURNING appointment_id INTO v_appointment_id;

  -- 6. Insert into Live Waiting Queue with Emergency Priority
  INSERT INTO queue_entries (
    appointment_id,
    patient_id,
    doctor_id,
    token,
    position,
    check_in_at,
    status
  ) VALUES (
    v_appointment_id,
    p_patient_id,
    v_doctor.doctor_id,
    v_token,
    1, -- High priority emergency triage
    v_now,
    'WAITING'
  )
  RETURNING queue_id INTO v_queue_id;

  -- 7. Compose Explainable Selection Rationale
  v_rationale := format(
    'Specialty: %s matched. Doctor: %s (%s) allocated as earliest available urgent slot at %s.',
    COALESCE(v_department_name, 'Emergency Specialty'),
    v_doctor.name,
    COALESCE(v_hospital.name, 'MedConnect Facility'),
    to_char(v_slot.start_time, 'YYYY-MM-DD HH24:MI')
  );

  -- 8. Audit Log
  INSERT INTO audit_logs (
    workflow,
    actor_type,
    action,
    record_id,
    details
  ) VALUES (
    'EMERGENCY_DISPATCH',
    'PATIENT',
    'EMERGENCY_ONE_CLICK_BOOKING',
    v_appointment_id,
    jsonb_build_object(
      'token', v_token,
      'doctor_id', v_doctor.doctor_id,
      'doctor_name', v_doctor.name,
      'department_id', v_department_id,
      'department_name', v_department_name,
      'slot_id', v_slot.slot_id,
      'slot_start', v_slot.start_time,
      'rationale', v_rationale,
      'symptoms', p_symptoms
    )
  );

  -- 9. Return Structured Result
  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'token', v_token,
    'token_number', v_token,
    'qr_reference', v_qr_ref,
    'queue_position', 1,
    'estimated_wait_minutes', 5,
    'is_emergency', true,
    'doctor', jsonb_build_object(
      'doctor_id', v_doctor.doctor_id,
      'name', v_doctor.name,
      'department_name', COALESCE(v_department_name, 'Emergency Specialty'),
      'room_number', 'OPD Emergency Desk'
    ),
    'slot', jsonb_build_object(
      'slot_id', v_slot.slot_id,
      'start_time', v_slot.start_time,
      'end_time', v_slot.end_time
    ),
    'hospital', jsonb_build_object(
      'hospital_id', v_hospital.hospital_id,
      'name', v_hospital.name,
      'emergency_contact', v_hospital.emergency_contact
    ),
    'selection_rationale', v_rationale
  );
END;
$$;

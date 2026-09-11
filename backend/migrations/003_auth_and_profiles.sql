-- ============================================================================
-- MedConnect Pulse — Database Migration 003: Auth & Extended Profiles
-- Description: Authentication columns, credential hashing support, extended
--              demographics (blood group, emergency contact), and point-to-point
--              Telegram chat routing isolation.
-- ============================================================================

-- 1. EXTEND HOSPITALS TABLE FOR AUTHENTICATION & DIRECT TELEGRAM ROUTING
ALTER TABLE hospitals 
  ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT 'medconnect123',
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'New Delhi',
  ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'Delhi',
  ADD COLUMN IF NOT EXISTS pincode TEXT DEFAULT '110029';

-- 2. EXTEND PATIENTS TABLE FOR AUTHENTICATION & CLINICAL DEMOGRAPHICS
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT 'patient123',
  ADD COLUMN IF NOT EXISTS blood_group TEXT DEFAULT 'O+',
  ADD COLUMN IF NOT EXISTS age INT DEFAULT 28,
  ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'Female',
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT;

-- 3. HELPER RPC: register_hospital
-- Enables secure facility onboarding with GPS coordinates and Telegram Chat ID
CREATE OR REPLACE FUNCTION register_hospital(
  p_name TEXT,
  p_contact TEXT,
  p_telegram_chat_id TEXT,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_address TEXT,
  p_contact_email TEXT,
  p_contact_person TEXT,
  p_password_hash TEXT,
  p_supported_resources TEXT[] DEFAULT ARRAY['BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'AMBULANCE']
)
RETURNS TABLE (
  hospital_id UUID,
  name TEXT,
  contact TEXT,
  telegram_chat_id TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  verification_status TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  INSERT INTO hospitals (
    name,
    contact,
    telegram_chat_id,
    latitude,
    longitude,
    address,
    contact_email,
    contact_person,
    password_hash,
    supported_resource_categories,
    active_status,
    verification_status
  ) VALUES (
    p_name,
    p_contact,
    p_telegram_chat_id,
    p_latitude,
    p_longitude,
    p_address,
    p_contact_email,
    p_contact_person,
    p_password_hash,
    p_supported_resources,
    true,
    'VERIFIED'
  )
  RETURNING hospitals.hospital_id INTO v_new_id;

  -- Initialize standard baseline resources for the newly registered facility
  INSERT INTO resources (hospital_id, resource_type, quantity_available)
  VALUES 
    (v_new_id, 'O_NEG_BLOOD', 6),
    (v_new_id, 'O_POS_BLOOD', 12),
    (v_new_id, 'OXYGEN_CYLINDER', 18),
    (v_new_id, 'ICU_BED', 4),
    (v_new_id, 'VENTILATOR', 3)
  ON CONFLICT (hospital_id, resource_type) DO NOTHING;

  RETURN QUERY
  SELECT 
    h.hospital_id,
    h.name,
    h.contact,
    h.telegram_chat_id,
    h.latitude,
    h.longitude,
    h.verification_status
  FROM hospitals h
  WHERE h.hospital_id = v_new_id;
END;
$$;

-- 4. HELPER RPC: register_patient
CREATE OR REPLACE FUNCTION register_patient(
  p_name TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_blood_group TEXT,
  p_age INT,
  p_gender TEXT,
  p_emergency_contact_name TEXT,
  p_emergency_contact_phone TEXT,
  p_address TEXT,
  p_password_hash TEXT
)
RETURNS TABLE (
  patient_id UUID,
  name TEXT,
  phone TEXT,
  blood_group TEXT,
  consent_status BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  INSERT INTO patients (
    name,
    phone,
    email,
    blood_group,
    age,
    gender,
    emergency_contact_name,
    emergency_contact_phone,
    address,
    password_hash,
    consent_status
  ) VALUES (
    p_name,
    p_phone,
    p_email,
    p_blood_group,
    p_age,
    p_gender,
    p_emergency_contact_name,
    p_emergency_contact_phone,
    p_address,
    p_password_hash,
    true
  )
  RETURNING patients.patient_id INTO v_patient_id;

  RETURN QUERY
  SELECT 
    p.patient_id,
    p.name,
    p.phone,
    p.blood_group,
    p.consent_status
  FROM patients p
  WHERE p.patient_id = v_patient_id;
END;
$$;

-- 5. RE-AFFIRM find_nearby_hospitals_for_emergency WITH ISOLATED POINT-TO-POINT ROUTING
-- Ensures requesting hospital is STRICTLY EXCLUDED and only nearby candidate facilities
-- with their registered telegram_chat_id are returned for individual delivery.
CREATE OR REPLACE FUNCTION find_nearby_hospitals_for_emergency(
  p_requesting_hospital_id UUID,
  p_resource_type TEXT,
  p_radius_km NUMERIC DEFAULT 10.0
)
RETURNS TABLE (
  hospital_id UUID,
  name TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  contact TEXT,
  telegram_chat_id TEXT,
  distance_km NUMERIC,
  quantity_available INT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_req_lat NUMERIC;
  v_req_lon NUMERIC;
BEGIN
  -- Get coordinates of the requesting hospital
  SELECT h.latitude, h.longitude INTO v_req_lat, v_req_lon
  FROM hospitals h
  WHERE h.hospital_id = p_requesting_hospital_id;

  IF v_req_lat IS NULL OR v_req_lon IS NULL THEN
    RAISE EXCEPTION 'Requesting hospital % not found or coordinates missing', p_requesting_hospital_id;
  END IF;

  RETURN QUERY
  SELECT
    h.hospital_id,
    h.name,
    h.latitude,
    h.longitude,
    h.contact,
    h.telegram_chat_id,
    calculate_distance_km(v_req_lat, v_req_lon, h.latitude, h.longitude) AS distance_km,
    COALESCE(r.quantity_available, 0)::INT AS quantity_available
  FROM hospitals h
  LEFT JOIN resources r
    ON r.hospital_id = h.hospital_id
   AND r.resource_type = p_resource_type
  WHERE h.hospital_id <> p_requesting_hospital_id  -- SENDER IS NEVER IN THE RECIPIENT LIST
    AND h.active_status = true
    AND h.telegram_chat_id IS NOT NULL            -- MUST HAVE REGISTERED TELEGRAM
    AND calculate_distance_km(v_req_lat, v_req_lon, h.latitude, h.longitude) <= p_radius_km
  ORDER BY distance_km ASC;
END;
$$;

-- 6. ENHANCED RPC: accept_emergency_request
-- Prevents self-acceptance: Requesting hospital cannot supply its own request
CREATE OR REPLACE FUNCTION accept_emergency_request(
  p_request_id UUID,
  p_supplying_hospital_id UUID,
  p_qr_ref TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_request RECORD;
  v_resource RECORD;
  v_dispatch_id UUID;
  v_response_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Lock emergency request row to serialize competing hospital acceptances
  SELECT * INTO v_request
  FROM emergency_requests
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REQUEST_NOT_FOUND',
      'message', 'Emergency request does not exist.'
    );
  END IF;

  -- Guard: SENDER CANNOT ACCEPT THEIR OWN REQUEST
  IF v_request.requesting_hospital_id = p_supplying_hospital_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SELF_SUPPLY_NOT_ALLOWED',
      'message', 'Requesting hospital cannot accept its own emergency requisition.'
    );
  END IF;

  IF v_request.status <> 'OPEN' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REQUEST_ALREADY_FULFILLED',
      'message', 'This emergency request has already been accepted or closed by another hospital.'
    );
  END IF;

  IF v_request.expires_at < v_now THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REQUEST_EXPIRED',
      'message', 'This emergency request has timed out.'
    );
  END IF;

  -- 2. Lock the supplying hospital's resource inventory row
  SELECT * INTO v_resource
  FROM resources
  WHERE hospital_id = p_supplying_hospital_id
    AND resource_type = v_request.resource_type
  FOR UPDATE;

  IF NOT FOUND OR v_resource.quantity_available < v_request.quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_STOCK',
      'message', 'Supplying hospital does not have sufficient quantity available in inventory.'
    );
  END IF;

  -- 3. Atomically decrement available stock and increment reserved stock
  UPDATE resources
  SET
    quantity_available = quantity_available - v_request.quantity,
    quantity_reserved  = quantity_reserved + v_request.quantity,
    updated_at         = v_now
  WHERE resource_id = v_resource.resource_id;

  -- 4. Mark emergency request as ACCEPTED
  UPDATE emergency_requests
  SET status = 'ACCEPTED'
  WHERE request_id = p_request_id;

  -- 5. Record response in emergency_responses
  INSERT INTO emergency_responses (
    request_id,
    supplying_hospital_id,
    status,
    accepted_at
  ) VALUES (
    p_request_id,
    p_supplying_hospital_id,
    'ACCEPTED',
    v_now
  )
  RETURNING response_id INTO v_response_id;

  -- 6. Generate active dispatch row with signed QR pass reference
  INSERT INTO dispatches (
    request_id,
    supplying_hospital_id,
    receiving_hospital_id,
    resource_type,
    quantity,
    qr_reference,
    status,
    created_at
  ) VALUES (
    p_request_id,
    p_supplying_hospital_id,
    v_request.requesting_hospital_id,
    v_request.resource_type,
    v_request.quantity,
    p_qr_ref,
    'PREPARED',
    v_now
  )
  RETURNING dispatch_id INTO v_dispatch_id;

  -- 7. Audit log entry
  INSERT INTO audit_logs (
    workflow,
    actor_type,
    action,
    record_id,
    details
  ) VALUES (
    'WF09_EMERGENCY_ACCEPT_LOCK',
    'HOSPITAL',
    'RESOURCE_RESERVED_AND_DISPATCHED',
    v_dispatch_id,
    jsonb_build_object(
      'request_id', p_request_id,
      'supplying_hospital_id', p_supplying_hospital_id,
      'receiving_hospital_id', v_request.requesting_hospital_id,
      'resource_type', v_request.resource_type,
      'quantity', v_request.quantity,
      'qr_reference', p_qr_ref
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'ACCEPTED',
    'dispatch_id', v_dispatch_id,
    'response_id', v_response_id,
    'request_id', p_request_id,
    'supplying_hospital_id', p_supplying_hospital_id,
    'receiving_hospital_id', v_request.requesting_hospital_id,
    'resource_type', v_request.resource_type,
    'quantity', v_request.quantity,
    'qr_reference', p_qr_ref,
    'reserved_at', v_now
  );
END;
$$;


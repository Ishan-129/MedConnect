-- ============================================================================
-- MedConnect Pulse — Database Migration 002: Geo & Emergency Systems
-- Description: Emergency requests, hospital resources inventory, dispatches,
--              communication logs, exceptions, Haversine geo-distance calculation,
--              and atomic concurrency-safe stored procedures (RPCs).
-- ============================================================================

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- Resources: Hospital inventory for blood, oxygen, ICU beds, ventilators, etc.
CREATE TABLE IF NOT EXISTS resources (
  resource_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  quantity_available INT NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  quantity_reserved INT NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  quantity_dispatched INT NOT NULL DEFAULT 0 CHECK (quantity_dispatched >= 0),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_hospital_resource UNIQUE (hospital_id, resource_type)
);

-- Emergency Requests: Critical resource requests broadcast to nearby facilities
CREATE TABLE IF NOT EXISTS emergency_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requesting_hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  priority TEXT NOT NULL DEFAULT 'HIGH',
  status TEXT DEFAULT 'OPEN',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 minutes')
);

-- Emergency Responses: Accept/Reject tracking from queried hospitals
CREATE TABLE IF NOT EXISTS emergency_responses (
  response_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES emergency_requests(request_id) ON DELETE CASCADE,
  supplying_hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ACCEPTED',
  rejection_reason TEXT,
  accepted_at TIMESTAMPTZ DEFAULT now()
);

-- Dispatches: Active logistical transfers with signed single-use QR pass
CREATE TABLE IF NOT EXISTS dispatches (
  dispatch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES emergency_requests(request_id) ON DELETE CASCADE,
  supplying_hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
  receiving_hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  qr_reference TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'PREPARED',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Communication Logs: Multi-channel delivery ledger (Telegram, Twilio, etc.)
CREATE TABLE IF NOT EXISTS communication_logs (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_or_hospital_ref TEXT,
  channel TEXT NOT NULL,
  template TEXT,
  workflow TEXT,
  delivery_status TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  correlation_id UUID
);

-- Exceptions: Incident capture and human-in-the-loop escalation ledger
CREATE TABLE IF NOT EXISTS exceptions (
  exception_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow TEXT,
  record_id UUID,
  error_type TEXT,
  severity TEXT,
  owner TEXT,
  status TEXT DEFAULT 'OPEN',
  resolution_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_resources_hospital ON resources(hospital_id);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_status ON emergency_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_hospital ON emergency_requests(requesting_hospital_id);
CREATE INDEX IF NOT EXISTS idx_emergency_responses_request ON emergency_responses(request_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_request ON dispatches(request_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_qr_reference ON dispatches(qr_reference);
CREATE INDEX IF NOT EXISTS idx_communication_logs_workflow ON communication_logs(workflow, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_exceptions_status ON exceptions(status, severity);

-- ============================================================================
-- 3. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE exceptions ENABLE ROW LEVEL SECURITY;

-- Public read for hospital resources in emergency network
DROP POLICY IF EXISTS "Public read resources" ON resources;
CREATE POLICY "Public read resources" ON resources FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read emergency_requests" ON emergency_requests;
CREATE POLICY "Public read emergency_requests" ON emergency_requests FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read emergency_responses" ON emergency_responses;
CREATE POLICY "Public read emergency_responses" ON emergency_responses FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read dispatches" ON dispatches;
CREATE POLICY "Public read dispatches" ON dispatches FOR SELECT USING (true);

-- Service role full access
DROP POLICY IF EXISTS "Service role full access resources" ON resources;
CREATE POLICY "Service role full access resources" ON resources USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access emergency_requests" ON emergency_requests;
CREATE POLICY "Service role full access emergency_requests" ON emergency_requests USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access emergency_responses" ON emergency_responses;
CREATE POLICY "Service role full access emergency_responses" ON emergency_responses USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access dispatches" ON dispatches;
CREATE POLICY "Service role full access dispatches" ON dispatches USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access communication_logs" ON communication_logs;
CREATE POLICY "Service role full access communication_logs" ON communication_logs USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access exceptions" ON exceptions;
CREATE POLICY "Service role full access exceptions" ON exceptions USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. STORED PROCEDURES & ATOMIC FUNCTIONS (RPCs)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RPC 1: calculate_distance_km
-- Haversine formula calculation without external Google Maps API dependency.
-- Earth radius = 6371 km
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_distance_km(
  lat1 NUMERIC,
  lon1 NUMERIC,
  lat2 NUMERIC,
  lon2 NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  dlat NUMERIC;
  dlon NUMERIC;
  a NUMERIC;
  c NUMERIC;
  r CONSTANT NUMERIC := 6371.0;
  rad_lat1 NUMERIC;
  rad_lat2 NUMERIC;
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN NULL;
  END IF;

  rad_lat1 := radians(lat1);
  rad_lat2 := radians(lat2);
  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);

  a := (sin(dlat / 2.0) ^ 2) + cos(rad_lat1) * cos(rad_lat2) * (sin(dlon / 2.0) ^ 2);

  -- Numerical precision guard: a must be between 0.0 and 1.0
  IF a > 1.0 THEN a := 1.0; END IF;
  IF a < 0.0 THEN a := 0.0; END IF;

  c := 2.0 * atan2(sqrt(a), sqrt(1.0 - a));

  RETURN ROUND((r * c)::numeric, 2);
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC 2: find_nearby_hospitals_for_emergency
-- Returns active candidate hospitals within configured radius having inventory.
-- ----------------------------------------------------------------------------
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
    COALESCE(r.quantity_available, 0) AS quantity_available
  FROM hospitals h
  LEFT JOIN resources r
    ON r.hospital_id = h.hospital_id
   AND r.resource_type = p_resource_type
  WHERE h.hospital_id <> p_requesting_hospital_id
    AND h.active_status = true
    AND calculate_distance_km(v_req_lat, v_req_lon, h.latitude, h.longitude) <= p_radius_km
  ORDER BY distance_km ASC;
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC 3: book_appointment_atomic
-- Prevents double booking via FOR UPDATE row lock on doctor_slots table.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION book_appointment_atomic(
  p_patient_id UUID,
  p_doctor_id UUID,
  p_department_id UUID,
  p_slot_id UUID,
  p_token TEXT,
  p_qr_ref TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot RECORD;
  v_appointment_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Row lock on the targeted doctor slot to serialize concurrent booking attempts
  SELECT * INTO v_slot
  FROM doctor_slots
  WHERE slot_id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SLOT_NOT_FOUND',
      'message', 'The requested appointment slot does not exist.'
    );
  END IF;

  -- Verify availability (allowing re-allocation only if slot was locked and timeout expired)
  IF v_slot.status <> 'AVAILABLE' AND (v_slot.locked_until IS NULL OR v_slot.locked_until > v_now) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SLOT_NOT_AVAILABLE',
      'message', 'Slot is already booked or currently locked by another patient.'
    );
  END IF;

  -- 2. Lock the slot to BOOKED status
  UPDATE doctor_slots
  SET status = 'BOOKED',
      locked_until = NULL
  WHERE slot_id = p_slot_id;

  -- 3. Create appointment record
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
    p_doctor_id,
    p_department_id,
    p_slot_id,
    v_slot.start_time,
    v_slot.end_time,
    p_token,
    p_qr_ref,
    'BOOKED',
    v_now
  )
  RETURNING appointment_id INTO v_appointment_id;

  -- 4. Record audit log
  INSERT INTO audit_logs (
    workflow,
    actor_type,
    action,
    record_id,
    details
  ) VALUES (
    'APPOINTMENT_BOOKING',
    'PATIENT',
    'BOOK_SLOT_ATOMIC',
    v_appointment_id,
    jsonb_build_object(
      'slot_id', p_slot_id,
      'doctor_id', p_doctor_id,
      'token', p_token,
      'slot_start', v_slot.start_time
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'token', p_token,
    'qr_reference', p_qr_ref,
    'slot_start', v_slot.start_time,
    'slot_end', v_slot.end_time
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC 4: accept_emergency_request
-- Prevents double-allocation using FOR UPDATE locks on request and inventory.
-- ----------------------------------------------------------------------------
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
      'error', 'INSUFFICIENT_INVENTORY',
      'message', 'Supplying hospital does not have sufficient quantity available.'
    );
  END IF;

  -- 3. Atomic inventory adjustment: move available quantity into reserved
  UPDATE resources
  SET quantity_available = quantity_available - v_request.quantity,
      quantity_reserved = quantity_reserved + v_request.quantity,
      updated_at = v_now
  WHERE resource_id = v_resource.resource_id;

  -- 4. Mark emergency request as ACCEPTED
  UPDATE emergency_requests
  SET status = 'ACCEPTED'
  WHERE request_id = p_request_id;

  -- 5. Record emergency response ledger
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

  -- 6. Generate dispatch entry with unique QR pass reference
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

  -- 7. Record audit log
  INSERT INTO audit_logs (
    workflow,
    actor_type,
    action,
    record_id,
    details
  ) VALUES (
    'EMERGENCY_DISPATCH',
    'EMERGENCY_MANAGER',
    'ACCEPT_AND_LOCK_INVENTORY',
    p_request_id,
    jsonb_build_object(
      'supplying_hospital_id', p_supplying_hospital_id,
      'resource_type', v_request.resource_type,
      'quantity', v_request.quantity,
      'dispatch_id', v_dispatch_id,
      'qr_reference', p_qr_ref
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'response_id', v_response_id,
    'qr_reference', p_qr_ref,
    'quantity_reserved', v_request.quantity,
    'remaining_available', v_resource.quantity_available - v_request.quantity
  );
END;
$$;

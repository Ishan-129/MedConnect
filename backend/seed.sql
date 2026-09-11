-- ============================================================================
-- MedConnect Pulse — Database Seed Data
-- Description: Real Delhi-NCR hospitals with precise coordinates, standard
--              medical departments, doctors, slots for today, live resources,
--              synthetic patients, and a sample emergency request.
-- ============================================================================

-- Clean existing data in dependency order for idempotent re-seeding
DELETE FROM audit_logs;
DELETE FROM communication_logs;
DELETE FROM exceptions;
DELETE FROM dispatches;
DELETE FROM emergency_responses;
DELETE FROM emergency_requests;
DELETE FROM resources;
DELETE FROM queue_entries;
DELETE FROM appointments;
DELETE FROM doctor_slots;
DELETE FROM doctors;
DELETE FROM departments;
DELETE FROM users;
DELETE FROM patients;
DELETE FROM hospitals;

-- ============================================================================
-- 1. HOSPITALS (Real Delhi-NCR Coordinates)
-- ============================================================================
INSERT INTO hospitals (
  hospital_id,
  name,
  latitude,
  longitude,
  contact,
  telegram_chat_id,
  active_status,
  verification_status,
  supported_resource_categories
) VALUES
(
  '11111111-1111-4111-a111-111111111111',
  'All India Institute of Medical Sciences (AIIMS) New Delhi',
  28.567200,
  77.210000,
  '+91-11-26588500',
  '-1002345678901',
  true,
  'VERIFIED',
  ARRAY['BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'MEDICINE', 'EQUIPMENT', 'AMBULANCE']
),
(
  '22222222-2222-4222-a222-222222222222',
  'Safdarjung Hospital',
  28.570000,
  77.207800,
  '+91-11-26165060',
  '-1002345678902',
  true,
  'VERIFIED',
  ARRAY['BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'MEDICINE', 'EQUIPMENT', 'AMBULANCE']
),
(
  '33333333-3333-4333-a333-333333333333',
  'Max Super Speciality Hospital Saket',
  28.528300,
  77.211400,
  '+91-11-26515050',
  '-1002345678903',
  true,
  'VERIFIED',
  ARRAY['BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'MEDICINE', 'EQUIPMENT', 'AMBULANCE']
),
(
  '44444444-4444-4444-a444-444444444444',
  'Fortis Escorts Heart Institute Okhla',
  28.560300,
  77.276400,
  '+91-11-47135000',
  '-1002345678904',
  true,
  'VERIFIED',
  ARRAY['BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'MEDICINE', 'EQUIPMENT', 'AMBULANCE']
),
(
  '55555555-5555-4555-a555-555555555555',
  'Indraprastha Apollo Hospital Sarita Vihar',
  28.539800,
  77.283200,
  '+91-11-26925858',
  '-1002345678905',
  true,
  'VERIFIED',
  ARRAY['BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'MEDICINE', 'EQUIPMENT', 'AMBULANCE']
);

-- ============================================================================
-- 2. DEPARTMENTS
-- ============================================================================
INSERT INTO departments (department_id, hospital_id, name, code) VALUES
-- AIIMS Departments
('c1111111-1111-4111-a111-111111111111', '11111111-1111-4111-a111-111111111111', 'Cardiology', 'CARD'),
('d1111111-1111-4111-a111-111111111111', '11111111-1111-4111-a111-111111111111', 'Dermatology', 'DERM'),
('o1111111-1111-4111-a111-111111111111', '11111111-1111-4111-a111-111111111111', 'Orthopedics', 'ORTHO'),
('g1111111-1111-4111-a111-111111111111', '11111111-1111-4111-a111-111111111111', 'General Medicine', 'GENMED'),
('e1111111-1111-4111-a111-111111111111', '11111111-1111-4111-a111-111111111111', 'Emergency Medicine', 'EMERG'),

-- Safdarjung Departments
('c2222222-2222-4222-a222-222222222222', '22222222-2222-4222-a222-222222222222', 'Cardiology', 'CARD'),
('g2222222-2222-4222-a222-222222222222', '22222222-2222-4222-a222-222222222222', 'General Medicine', 'GENMED'),

-- Max Saket Departments
('c3333333-3333-4333-a333-333333333333', '33333333-3333-4333-a333-333333333333', 'Cardiology', 'CARD'),
('d3333333-3333-4333-a333-333333333333', '33333333-3333-4333-a333-333333333333', 'Dermatology', 'DERM');

-- ============================================================================
-- 3. DOCTORS
-- ============================================================================
INSERT INTO doctors (doctor_id, hospital_id, department_id, name, active_status) VALUES
-- AIIMS Doctors
('a0000001-0000-4000-a000-000000000001', '11111111-1111-4111-a111-111111111111', 'c1111111-1111-4111-a111-111111111111', 'Dr. Ananya Sharma (Cardiologist)', true),
('a0000002-0000-4000-a000-000000000002', '11111111-1111-4111-a111-111111111111', 'd1111111-1111-4111-a111-111111111111', 'Dr. Rajesh Verma (Dermatologist)', true),
('a0000003-0000-4000-a000-000000000003', '11111111-1111-4111-a111-111111111111', 'o1111111-1111-4111-a111-111111111111', 'Dr. Vikramaditya Rao (Orthopedic Surgeon)', true),
('a0000004-0000-4000-a000-000000000004', '11111111-1111-4111-a111-111111111111', 'g1111111-1111-4111-a111-111111111111', 'Dr. Priya Nair (Physician)', true),
('a0000005-0000-4000-a000-000000000005', '11111111-1111-4111-a111-111111111111', 'e1111111-1111-4111-a111-111111111111', 'Dr. Harsh Vardhan (Emergency Triage)', true),

-- Safdarjung Doctor
('b0000001-0000-4000-a000-000000000001', '22222222-2222-4222-a222-222222222222', 'c2222222-2222-4222-a222-222222222222', 'Dr. Neha Gupta (Cardiologist)', true),

-- Max Saket Doctor
('c0000001-0000-4000-a000-000000000001', '33333333-3333-4333-a333-333333333333', 'c3333333-3333-4333-a333-333333333333', 'Dr. Sameer Sen (Cardiothoracic Specialist)', true);

-- ============================================================================
-- 4. DOCTOR SLOTS (Today and Tomorrow)
-- ============================================================================
-- AIIMS Dr. Ananya Sharma (Cardiology) slots for today
INSERT INTO doctor_slots (slot_id, doctor_id, start_time, end_time, status) VALUES
('s0000001-0000-4000-a000-000000000001', 'a0000001-0000-4000-a000-000000000001', (CURRENT_DATE + interval '9 hours 0 minutes'), (CURRENT_DATE + interval '9 hours 30 minutes'), 'AVAILABLE'),
('s0000002-0000-4000-a000-000000000002', 'a0000001-0000-4000-a000-000000000001', (CURRENT_DATE + interval '9 hours 30 minutes'), (CURRENT_DATE + interval '10 hours 0 minutes'), 'AVAILABLE'),
('s0000003-0000-4000-a000-000000000003', 'a0000001-0000-4000-a000-000000000001', (CURRENT_DATE + interval '10 hours 0 minutes'), (CURRENT_DATE + interval '10 hours 30 minutes'), 'AVAILABLE'),
('s0000004-0000-4000-a000-000000000004', 'a0000001-0000-4000-a000-000000000001', (CURRENT_DATE + interval '10 hours 30 minutes'), (CURRENT_DATE + interval '11 hours 0 minutes'), 'AVAILABLE'),
('s0000005-0000-4000-a000-000000000005', 'a0000001-0000-4000-a000-000000000001', (CURRENT_DATE + interval '11 hours 0 minutes'), (CURRENT_DATE + interval '11 hours 30 minutes'), 'AVAILABLE'),
('s0000006-0000-4000-a000-000000000006', 'a0000001-0000-4000-a000-000000000001', (CURRENT_DATE + interval '14 hours 0 minutes'), (CURRENT_DATE + interval '14 hours 30 minutes'), 'AVAILABLE'),
('s0000007-0000-4000-a000-000000000007', 'a0000001-0000-4000-a000-000000000001', (CURRENT_DATE + interval '14 hours 30 minutes'), (CURRENT_DATE + interval '15 hours 0 minutes'), 'AVAILABLE');

-- AIIMS Dr. Rajesh Verma (Dermatology) slots for today
INSERT INTO doctor_slots (slot_id, doctor_id, start_time, end_time, status) VALUES
('s0000010-0000-4000-a000-000000000010', 'a0000002-0000-4000-a000-000000000002', (CURRENT_DATE + interval '9 hours 30 minutes'), (CURRENT_DATE + interval '10 hours 0 minutes'), 'AVAILABLE'),
('s0000011-0000-4000-a000-000000000011', 'a0000002-0000-4000-a000-000000000002', (CURRENT_DATE + interval '10 hours 0 minutes'), (CURRENT_DATE + interval '10 hours 30 minutes'), 'AVAILABLE'),
('s0000012-0000-4000-a000-000000000012', 'a0000002-0000-4000-a000-000000000002', (CURRENT_DATE + interval '11 hours 0 minutes'), (CURRENT_DATE + interval '11 hours 30 minutes'), 'AVAILABLE'),
('s0000013-0000-4000-a000-000000000013', 'a0000002-0000-4000-a000-000000000002', (CURRENT_DATE + interval '15 hours 0 minutes'), (CURRENT_DATE + interval '15 hours 30 minutes'), 'AVAILABLE');

-- AIIMS Dr. Priya Nair (General Medicine) slots for today
INSERT INTO doctor_slots (slot_id, doctor_id, start_time, end_time, status) VALUES
('s0000020-0000-4000-a000-000000000020', 'a0000004-0000-4000-a000-000000000004', (CURRENT_DATE + interval '10 hours 0 minutes'), (CURRENT_DATE + interval '10 hours 30 minutes'), 'AVAILABLE'),
('s0000021-0000-4000-a000-000000000021', 'a0000004-0000-4000-a000-000000000004', (CURRENT_DATE + interval '10 hours 30 minutes'), (CURRENT_DATE + interval '11 hours 0 minutes'), 'AVAILABLE'),
('s0000022-0000-4000-a000-000000000022', 'a0000004-0000-4000-a000-000000000004', (CURRENT_DATE + interval '11 hours 30 minutes'), (CURRENT_DATE + interval '12 hours 0 minutes'), 'AVAILABLE');

-- ============================================================================
-- 5. SYNTHETIC PATIENTS
-- ============================================================================
INSERT INTO patients (patient_id, name, phone, email, consent_status) VALUES
('p0000001-0000-4000-a000-000000000001', 'Ramesh Kumar', '+919876543210', 'ramesh.kumar@example.com', true),
('p0000002-0000-4000-a000-000000000002', 'Sunita Sharma', '+919876543211', 'sunita.sharma@example.com', true),
('p0000003-0000-4000-a000-000000000003', 'Amit Patel', '+919876543212', 'amit.patel@example.com', true);

-- ============================================================================
-- 6. SYSTEM USERS (Staff & Roles)
-- ============================================================================
INSERT INTO users (user_id, hospital_id, role, name, phone, status) VALUES
('u0000001-0000-4000-a000-000000000001', '11111111-1111-4111-a111-111111111111', 'ADMIN', 'Dr. M. Srinivas (Director, AIIMS)', '+911126588500', 'ACTIVE'),
('u0000002-0000-4000-a000-000000000002', '11111111-1111-4111-a111-111111111111', 'RECEPTIONIST', 'Pooja Verma (OPD Desk A)', '+919811000001', 'ACTIVE'),
('u0000003-0000-4000-a000-000000000003', '11111111-1111-4111-a111-111111111111', 'DOCTOR', 'Dr. Ananya Sharma', '+919811000002', 'ACTIVE'),
('u0000004-0000-4000-a000-000000000004', '11111111-1111-4111-a111-111111111111', 'EMERGENCY_MANAGER', 'Vikas Chawla (Emergency Dispatcher)', '+919811000003', 'ACTIVE'),
('u0000005-0000-4000-a000-000000000005', '22222222-2222-4222-a222-222222222222', 'EMERGENCY_MANAGER', 'Suresh Menon (Safdarjung ER Lead)', '+919811000004', 'ACTIVE'),
('u0000006-0000-4000-a000-000000000006', '33333333-3333-4333-a333-333333333333', 'EMERGENCY_MANAGER', 'Dr. Alok Nath (Max Saket Critical Care)', '+919811000005', 'ACTIVE');

-- ============================================================================
-- 7. HOSPITAL RESOURCE INVENTORIES (Live Stock)
-- ============================================================================
INSERT INTO resources (hospital_id, resource_type, quantity_available, quantity_reserved, quantity_dispatched) VALUES
-- AIIMS Inventory
('11111111-1111-4111-a111-111111111111', 'O_NEG_BLOOD', 12, 2, 0),
('11111111-1111-4111-a111-111111111111', 'OXYGEN', 85, 10, 0),
('11111111-1111-4111-a111-111111111111', 'ICU_BED', 6, 2, 0),
('11111111-1111-4111-a111-111111111111', 'VENTILATOR', 4, 1, 0),
('11111111-1111-4111-a111-111111111111', 'AMBULANCE', 5, 0, 0),

-- Safdarjung Inventory
('22222222-2222-4222-a222-222222222222', 'O_NEG_BLOOD', 8, 1, 0),
('22222222-2222-4222-a222-222222222222', 'OXYGEN', 50, 5, 0),
('22222222-2222-4222-a222-222222222222', 'ICU_BED', 4, 0, 0),
('22222222-2222-4222-a222-222222222222', 'VENTILATOR', 3, 0, 0),
('22222222-2222-4222-a222-222222222222', 'AMBULANCE', 3, 0, 0),

-- Max Super Speciality Saket Inventory
('33333333-3333-4333-a333-333333333333', 'O_NEG_BLOOD', 15, 0, 0),
('33333333-3333-4333-a333-333333333333', 'OXYGEN', 110, 15, 0),
('33333333-3333-4333-a333-333333333333', 'ICU_BED', 10, 1, 0),
('33333333-3333-4333-a333-333333333333', 'VENTILATOR', 8, 0, 0),
('33333333-3333-4333-a333-333333333333', 'AMBULANCE', 7, 0, 0),

-- Fortis Escorts Heart Institute Inventory
('44444444-4444-4444-a444-444444444444', 'O_NEG_BLOOD', 6, 0, 0),
('44444444-4444-4444-a444-444444444444', 'OXYGEN', 40, 0, 0),
('44444444-4444-4444-a444-444444444444', 'ICU_BED', 5, 0, 0),
('44444444-4444-4444-a444-444444444444', 'VENTILATOR', 4, 0, 0),
('44444444-4444-4444-a444-444444444444', 'AMBULANCE', 4, 0, 0),

-- Indraprastha Apollo Hospital Inventory
('55555555-5555-4555-a555-555555555555', 'O_NEG_BLOOD', 18, 2, 0),
('55555555-5555-4555-a555-555555555555', 'OXYGEN', 120, 20, 0),
('55555555-5555-4555-a555-555555555555', 'ICU_BED', 12, 2, 0),
('55555555-5555-4555-a555-555555555555', 'VENTILATOR', 9, 1, 0),
('55555555-5555-4555-a555-555555555555', 'AMBULANCE', 6, 0, 0);

-- ============================================================================
-- 8. SAMPLE EMERGENCY REQUEST (Safdarjung requesting 4 units O- Blood)
-- ============================================================================
INSERT INTO emergency_requests (
  request_id,
  requesting_hospital_id,
  resource_type,
  quantity,
  priority,
  status,
  created_at,
  expires_at
) VALUES (
  'e0000001-0000-4000-a000-000000000001',
  '22222222-2222-4222-a222-222222222222', -- Safdarjung Hospital
  'O_NEG_BLOOD',
  4,
  'CRITICAL',
  'OPEN',
  now(),
  now() + interval '30 minutes'
);

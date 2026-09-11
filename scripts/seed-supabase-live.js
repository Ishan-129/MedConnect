import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function seed() {
  console.log('=== Seeding Live Supabase Database with Accurate Schema ===');

  // 1. Hospitals (Delhi-NCR)
  const hospitals = [
    {
      id: '11111111-1111-4111-a111-111111111111',
      name: 'All India Institute of Medical Sciences (AIIMS) New Delhi',
      latitude: 28.567200,
      longitude: 77.210000,
      address: 'Ansari Nagar, New Delhi, Delhi 110029',
      contact_phone: '+91-11-26588500',
      telegram_chat_id: '6537122486',
      is_active: true,
    },
    {
      id: '22222222-2222-4222-a222-222222222222',
      name: 'Safdarjung Hospital',
      latitude: 28.570000,
      longitude: 77.207800,
      address: 'Ring Road, Opposite AIIMS, New Delhi, Delhi 110029',
      contact_phone: '+91-11-26165060',
      telegram_chat_id: '6537122486',
      is_active: true,
    },
    {
      id: '33333333-3333-4333-a333-333333333333',
      name: 'Max Super Speciality Hospital Saket',
      latitude: 28.528300,
      longitude: 77.211400,
      address: '1 2, Press Enclave Marg, Saket, New Delhi, Delhi 110017',
      contact_phone: '+91-11-26515050',
      telegram_chat_id: '6537122486',
      is_active: true,
    },
    {
      id: '44444444-4444-4444-a444-444444444444',
      name: 'Fortis Escorts Heart Institute Okhla',
      latitude: 28.560300,
      longitude: 77.276400,
      address: 'Okhla Road, Sukhdev Vihar, New Delhi, Delhi 110025',
      contact_phone: '+91-11-47135000',
      telegram_chat_id: '6537122486',
      is_active: true,
    },
    {
      id: '55555555-5555-4555-a555-555555555555',
      name: 'Indraprastha Apollo Hospital Jasola',
      latitude: 28.541300,
      longitude: 77.283100,
      address: 'Sarita Vihar, Delhi Mathura Road, New Delhi, Delhi 110076',
      contact_phone: '+91-11-26925858',
      telegram_chat_id: '6537122486',
      is_active: true,
    }
  ];

  console.log('Upserting hospitals...');
  const { data: hospData, error: hospErr } = await supabase.from('hospitals').upsert(hospitals, { onConflict: 'id' }).select();
  if (hospErr) console.error('Hospitals error:', hospErr);
  else console.log(`✓ Inserted ${hospData.length} hospitals`);

  // 2. Departments
  const departments = [
    {
      id: '79914d3e-1112-47bf-b3f9-3facdbd31d04',
      hospital_id: '11111111-1111-4111-a111-111111111111',
      name: 'Cardiology',
      doctor_count: 2,
      average_consultation_minutes: 15,
    },
    {
      id: 'b7512ac3-6be5-4449-93e0-98d4a059d382',
      hospital_id: '11111111-1111-4111-a111-111111111111',
      name: 'Orthopedics',
      doctor_count: 2,
      average_consultation_minutes: 15,
    },
    {
      id: '476b2552-7c7d-4d27-b01b-4bce1e33347a',
      hospital_id: '11111111-1111-4111-a111-111111111111',
      name: 'General Medicine',
      doctor_count: 3,
      average_consultation_minutes: 10,
    },
    {
      id: 'd2dbb8b3-df50-4b9d-9d24-0fcd4b902ed3',
      hospital_id: '11111111-1111-4111-a111-111111111111',
      name: 'Pediatrics',
      doctor_count: 2,
      average_consultation_minutes: 15,
    },
    // Safdarjung Departments
    {
      id: 'c2222222-2222-4222-a222-222222222222',
      hospital_id: '22222222-2222-4222-a222-222222222222',
      name: 'Cardiology',
      doctor_count: 1,
      average_consultation_minutes: 15,
    },
    {
      id: '02222222-2222-4222-a222-222222222222',
      hospital_id: '22222222-2222-4222-a222-222222222222',
      name: 'Orthopedics',
      doctor_count: 1,
      average_consultation_minutes: 15,
    }
  ];

  console.log('Upserting departments...');
  const { data: deptData, error: deptErr } = await supabase.from('departments').upsert(departments, { onConflict: 'id' }).select();
  if (deptErr) console.error('Departments error:', deptErr);
  else console.log(`✓ Inserted ${deptData.length} departments`);

  // 3. Doctors
  const doctors = [
    {
      id: '51b2a6b8-52aa-4586-baa1-8e352b82903f',
      hospital_id: '11111111-1111-4111-a111-111111111111',
      department_id: '79914d3e-1112-47bf-b3f9-3facdbd31d04',
      name: 'Dr. Ananya Roy',
      specialization: 'Senior Interventional Cardiologist, MD, DM',
      room_number: 'OPD 204',
      is_active: true,
    },
    {
      id: 'def5ff12-6f2f-43a0-b8d0-5aec91d7a320',
      hospital_id: '11111111-1111-4111-a111-111111111111',
      department_id: 'b7512ac3-6be5-4449-93e0-98d4a059d382',
      name: 'Dr. Rajesh Sharma',
      specialization: 'Senior Orthopedic & Joint Replacement Surgeon, MS',
      room_number: 'OPD 312',
      is_active: true,
    },
    {
      id: 'a0000004-0000-4000-a000-000000000004',
      hospital_id: '11111111-1111-4111-a111-111111111111',
      department_id: '476b2552-7c7d-4d27-b01b-4bce1e33347a',
      name: 'Dr. Priya Nair',
      specialization: 'Senior Consultant Physician, MBBS, MD (General Medicine)',
      room_number: 'OPD 101',
      is_active: true,
    },
    {
      id: 'a0000005-0000-4000-a000-000000000005',
      hospital_id: '11111111-1111-4111-a111-111111111111',
      department_id: 'd2dbb8b3-df50-4b9d-9d24-0fcd4b902ed3',
      name: 'Dr. Vikramaditya Rao',
      specialization: 'Pediatric Specialist & Neonatologist, MD',
      room_number: 'OPD 208',
      is_active: true,
    },
    // Safdarjung Doctor
    {
      id: 'b0000001-0000-4000-a000-000000000001',
      hospital_id: '22222222-2222-4222-a222-222222222222',
      department_id: 'c2222222-2222-4222-a222-222222222222',
      name: 'Dr. Neha Gupta',
      specialization: 'Consultant Cardiologist, MD',
      room_number: 'Cardio OPD 1',
      is_active: true,
    }
  ];

  console.log('Upserting doctors...');
  const { data: docData, error: docErr } = await supabase.from('doctors').upsert(doctors, { onConflict: 'id' }).select();
  if (docErr) console.error('Doctors error:', docErr);
  else console.log(`✓ Inserted ${docData.length} doctors`);

  // 4. Slots for next 7 days
  const timeBlocks = [
    { start: '09:00:00', end: '09:30:00' },
    { start: '09:30:00', end: '10:00:00' },
    { start: '10:00:00', end: '10:30:00' },
    { start: '10:30:00', end: '11:00:00' },
    { start: '11:00:00', end: '11:30:00' },
    { start: '11:30:00', end: '12:00:00' },
    { start: '14:00:00', end: '14:30:00' },
    { start: '14:30:00', end: '15:00:00' },
    { start: '15:00:00', end: '15:30:00' },
    { start: '15:30:00', end: '16:00:00' },
    { start: '16:00:00', end: '16:30:00' },
  ];

  const slotsToInsert = [];
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const dateStr = d.toISOString().split('T')[0];

    for (const doc of doctors) {
      for (let i = 0; i < timeBlocks.length; i++) {
        const tb = timeBlocks[i];
        slotsToInsert.push({
          id: crypto.randomUUID(),
          hospital_id: doc.hospital_id,
          doctor_id: doc.id,
          department_id: doc.department_id,
          doctor_name: doc.name,
          slot_date: dateStr,
          start_time: tb.start,
          end_time: tb.end,
          status: 'available',
          version: 1,
        });
      }
    }
  }

  console.log(`Upserting ${slotsToInsert.length} slots...`);
  const { data: slotData, error: slotErr } = await supabase.from('slots').upsert(slotsToInsert, { onConflict: 'id' }).select();
  if (slotErr) console.error('Slots error:', slotErr);
  else console.log(`✓ Inserted ${slotData.length} slots`);

  // 5. Hospital Resources (Oxygen cylinders, Blood, ICU Beds)
  const resources = [
    // AIIMS (Hospital A)
    { id: '10000000-0000-0000-0000-000000000001', hospital_id: '11111111-1111-4111-a111-111111111111', resource_type: 'OXYGEN_CYLINDER', total_quantity: 100, available_quantity: 85 },
    { id: '10000000-0000-0000-0000-000000000002', hospital_id: '11111111-1111-4111-a111-111111111111', resource_type: 'BLOOD_O_NEG', total_quantity: 20, available_quantity: 12 },
    { id: '10000000-0000-0000-0000-000000000003', hospital_id: '11111111-1111-4111-a111-111111111111', resource_type: 'ICU_BED', total_quantity: 10, available_quantity: 4 },
    // Safdarjung (Hospital B - 1.8km from AIIMS)
    { id: '20000000-0000-0000-0000-000000000001', hospital_id: '22222222-2222-4222-a222-222222222222', resource_type: 'OXYGEN_CYLINDER', total_quantity: 60, available_quantity: 50 },
    { id: '20000000-0000-0000-0000-000000000002', hospital_id: '22222222-2222-4222-a222-222222222222', resource_type: 'BLOOD_O_NEG', total_quantity: 25, available_quantity: 20 },
    { id: '20000000-0000-0000-0000-000000000003', hospital_id: '22222222-2222-4222-a222-222222222222', resource_type: 'ICU_BED', total_quantity: 15, available_quantity: 8 },
    // Max Saket (Hospital C - 4.5km)
    { id: '30000000-0000-0000-0000-000000000001', hospital_id: '33333333-3333-4333-a333-333333333333', resource_type: 'OXYGEN_CYLINDER', total_quantity: 125, available_quantity: 110 },
    { id: '30000000-0000-0000-0000-000000000002', hospital_id: '33333333-3333-4333-a333-333333333333', resource_type: 'BLOOD_O_NEG', total_quantity: 30, available_quantity: 15 },
    // Fortis Escorts (Hospital D - 6.8km)
    { id: '40000000-0000-0000-0000-000000000001', hospital_id: '44444444-4444-4444-a444-444444444444', resource_type: 'OXYGEN_CYLINDER', total_quantity: 50, available_quantity: 40 },
    // Apollo Hospital (Hospital E - 8.2km)
    { id: '50000000-0000-0000-0000-000000000001', hospital_id: '55555555-5555-4555-a555-555555555555', resource_type: 'OXYGEN_CYLINDER', total_quantity: 140, available_quantity: 120 },
  ];

  console.log('Upserting hospital resources...');
  const { data: resData, error: resErr } = await supabase.from('hospital_resources').upsert(resources, { onConflict: 'id' }).select();
  if (resErr) console.error('Resources error:', resErr);
  else console.log(`✓ Inserted ${resData.length} hospital resources`);

  console.log('=== Seeding Completed Successfully! ===');
}

seed().catch(err => {
  console.error('Fatal seeding error:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * MedConnect Pulse — AI Receptionist Real Database Slot & Doctor Sync
 * Ensures all hospital departments have active doctors and available upcoming slots.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

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

async function seedDoctorsAndSlots() {
  console.log('--- Checking Hospitals and Departments ---');
  const { data: hospitals, error: hospErr } = await supabase.from('hospitals').select('*').eq('is_active', true);
  if (hospErr || !hospitals || hospitals.length === 0) {
    console.error('Failed to fetch hospitals:', hospErr);
    return;
  }
  const defaultHospital = hospitals.find(h => h.name.includes('Yashoda')) || hospitals[0];
  console.log(`Using Hospital: ${defaultHospital.name} (${defaultHospital.id})`);

  const { data: departments } = await supabase.from('departments').select('*').eq('hospital_id', defaultHospital.id);
  console.log(`Found ${departments?.length || 0} departments`);

  // Ensure doctors exist for General Medicine and Pediatrics if missing
  const genMedDept = departments?.find(d => d.name.toLowerCase().includes('general'));
  const orthoDept = departments?.find(d => d.name.toLowerCase().includes('ortho'));
  const cardioDept = departments?.find(d => d.name.toLowerCase().includes('cardio'));
  const pediaDept = departments?.find(d => d.name.toLowerCase().includes('pedia'));

  const { data: existingDoctors } = await supabase.from('doctors').select('*').eq('hospital_id', defaultHospital.id);
  console.log(`Found ${existingDoctors?.length || 0} existing doctors in DB`);

  if (genMedDept && !existingDoctors?.some(d => d.department_id === genMedDept.id)) {
    console.log('Seeding Dr. Priya Nair into General Medicine...');
    await supabase.from('doctors').insert([{
      hospital_id: defaultHospital.id,
      department_id: genMedDept.id,
      name: 'Dr. Priya Nair',
      specialization: 'Senior Consultant Physician, MBBS, MD (General Medicine)',
      room_number: 'OPD 101',
      is_active: true
    }]);
  }

  if (pediaDept && !existingDoctors?.some(d => d.department_id === pediaDept.id)) {
    console.log('Seeding Dr. Vikramaditya Rao into Pediatrics...');
    await supabase.from('doctors').insert([{
      hospital_id: defaultHospital.id,
      department_id: pediaDept.id,
      name: 'Dr. Vikramaditya Rao',
      specialization: 'Pediatric Specialist & Neonatologist, MD',
      room_number: 'OPD 305',
      is_active: true
    }]);
  }

  // Fetch updated list of active doctors
  const { data: allDoctors } = await supabase.from('doctors').select('*').eq('hospital_id', defaultHospital.id).eq('is_active', true);
  console.log(`Active doctors ready for slots: ${allDoctors?.length || 0}`);

  // Ensure slots exist for today through next 14 days
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

  const now = new Date();
  let totalSlotsInserted = 0;

  for (const doc of allDoctors || []) {
    for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
      const d = new Date(now.getTime() + dayOffset * 86400000);
      const dateStr = d.toISOString().split('T')[0];

      // Check existing slots for this doctor and date
      const { data: existingSlots } = await supabase
        .from('slots')
        .select('start_time')
        .eq('doctor_id', doc.id)
        .eq('slot_date', dateStr);

      const existingStarts = new Set((existingSlots || []).map(s => s.start_time));
      const missingBlocks = timeBlocks.filter(tb => !existingStarts.has(tb.start));

      if (missingBlocks.length > 0) {
        const slotsToInsert = missingBlocks.map(tb => ({
          hospital_id: defaultHospital.id,
          department_id: doc.department_id,
          doctor_id: doc.id,
          doctor_name: doc.name,
          slot_date: dateStr,
          start_time: tb.start,
          end_time: tb.end,
          status: 'available',
          version: 1
        }));

        const { error: insErr } = await supabase.from('slots').insert(slotsToInsert);
        if (!insErr) {
          totalSlotsInserted += slotsToInsert.length;
        }
      }
    }
  }

  console.log(`✅ Slot sync complete: ${totalSlotsInserted} new slots generated across 14-day window.`);
}

seedDoctorsAndSlots().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});

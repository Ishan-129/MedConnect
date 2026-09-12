import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const candidateTables = [
  'dispatches',
  'emergency_requests',
  'hospital_resources',
  'prescription_items',
  'prescriptions',
  'communication_log',
  'audit_log',
  'exception_log',
  'qr_tokens',
  'medicines',
  'appointments',
  'slots',
  'doctors',
  'departments',
  'patients',
  'hospitals'
];

async function check() {
  console.log('=== Checking Tables in Supabase ===');
  
  // Try fetching swagger / openapi schema to list ALL exposed tables
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${SUPABASE_KEY}`);
    const openapi = await res.json();
    if (openapi && openapi.definitions) {
      console.log('All tables exposed via PostgREST:', Object.keys(openapi.definitions));
    }
  } catch (e) {
    console.log('Could not fetch OpenAPI spec:', e.message);
  }

  for (const tbl of candidateTables) {
    const { count, error, data } = await supabase.from(tbl).select('*', { count: 'exact' }).limit(1);
    if (error) {
      console.log(`Table ${tbl.padEnd(22)}: Error / Not found (${error.message})`);
    } else {
      console.log(`Table ${tbl.padEnd(22)}: ${count} rows`);
    }
  }

  try {
    const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) {
      console.log(`Auth users check error: ${authErr.message}`);
    } else {
      console.log(`Table auth.users            : ${users?.length || 0} users`);
    }
  } catch (e) {
    console.log(`Auth users check exception: ${e.message}`);
  }
}

check();

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

const tables = [
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

async function backup() {
  console.log('=== Starting Database Backup before Reset ===');
  const backupData = { timestamp: new Date().toISOString(), tables: {}, auth_users: [] };

  for (const tbl of tables) {
    const { data, error } = await supabase.from(tbl).select('*');
    if (error) {
      console.warn(`Warning: Could not fetch ${tbl}:`, error.message);
      backupData.tables[tbl] = [];
    } else {
      console.log(`Backed up ${tbl}: ${data?.length || 0} rows`);
      backupData.tables[tbl] = data || [];
    }
  }

  try {
    const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) {
      console.warn('Warning: Could not fetch auth.users:', authErr.message);
    } else {
      console.log(`Backed up auth.users: ${users?.length || 0} users`);
      backupData.auth_users = users || [];
    }
  } catch (e) {
    console.warn('Auth user backup exception:', e.message);
  }

  const backupPath = path.resolve(process.cwd(), 'scripts', 'backup-before-reset.json');
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`\nBackup saved successfully to: ${backupPath}`);
}

backup();

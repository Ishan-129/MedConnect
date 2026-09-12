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

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// Ordered strictly from child to parent to satisfy foreign key integrity
const tablesToClear = [
  'prescription_items',
  'prescriptions',
  'dispatches',
  'emergency_requests',
  'hospital_resources',
  'communication_log',
  'exception_log',
  'audit_log',
  'qr_tokens',
  'appointments',
  'slots',
  'doctors',
  'departments',
  'patients',
  'hospitals',
  'medicines'
];

async function resetDatabase() {
  console.log('====================================================');
  console.log('    MedConnect Pulse — Supabase Database Reset');
  console.log('    (Preserves table schemas, triggers & functions)');
  console.log('====================================================\n');

  // 1. Clear each table's data
  for (const table of tablesToClear) {
    process.stdout.write(`Clearing table [${table}]... `);
    const { error } = await supabase
      .from(table)
      .delete()
      .not('id', 'is', null);

    if (error) {
      console.log(`FAILED ❌ (${error.message})`);
    } else {
      console.log(`CLEARED ✅`);
    }
  }

  // 2. Clear Supabase Auth Users
  console.log('\nClearing Supabase Auth users (auth.users)...');
  try {
    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) {
      console.log(`Failed to list auth users: ${listErr.message}`);
    } else if (users && users.length > 0) {
      console.log(`Found ${users.length} auth users to remove.`);
      let deletedCount = 0;
      for (const u of users) {
        const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
        if (!delErr) {
          deletedCount++;
        }
      }
      console.log(`Deleted ${deletedCount} / ${users.length} auth users ✅`);
    } else {
      console.log('No auth users found in auth.users.');
    }
  } catch (e) {
    console.log(`Auth user cleanup error: ${e.message}`);
  }

  // 3. Post-reset verification: Check row counts of all tables
  console.log('\n====================================================');
  console.log('    Post-Reset Verification (All row counts)');
  console.log('====================================================');
  for (const table of tablesToClear) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact' })
      .limit(1);

    if (error) {
      console.log(`Table ${table.padEnd(24)}: Error (${error.message})`);
    } else {
      console.log(`Table ${table.padEnd(24)}: ${count} rows left`);
    }
  }

  const { data: { users: remainingUsers } } = await supabase.auth.admin.listUsers();
  console.log(`Table auth.users              : ${remainingUsers?.length || 0} users left`);
  console.log('\nDatabase reset complete. All table structures, columns, indexes, and RPC functions remain fully intact!');
}

resetDatabase();

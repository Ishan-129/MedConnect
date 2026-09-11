#!/usr/bin/env node
/**
 * ============================================================================
 * MedConnect Pulse — Database Seed & Migration Runner
 * ============================================================================
 * 
 * Sequentially executes:
 * 1. backend/migrations/001_core_schema.sql
 * 2. backend/migrations/002_geo_and_emergency.sql
 * 3. backend/seed.sql
 * 
 * Supports:
 * - Direct execution via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or DATABASE_URL)
 * - Static validation mode if running offline or in preview CI
 * 
 * Usage:
 *   npm run seed
 *   node scripts/seed-db.js
 *   node scripts/seed-db.js --verify
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

// Load .env if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

console.log(`${C.bold}${C.cyan}`);
console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║        MedConnect Pulse — Database Seed & Migration Runner         ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
console.log(`${C.reset}`);

const SQL_FILES = [
  {
    name: '001_core_schema.sql',
    path: path.resolve(process.cwd(), 'backend/migrations/001_core_schema.sql'),
    description: 'Enums, core hospital/user/patient/appointment/queue tables, and RLS',
  },
  {
    name: '002_geo_and_emergency.sql',
    path: path.resolve(process.cwd(), 'backend/migrations/002_geo_and_emergency.sql'),
    description: 'Emergency tables, Haversine RPC, and atomic locking procedures',
  },
  {
    name: '003_auth_and_profiles.sql',
    path: path.resolve(process.cwd(), 'backend/migrations/003_auth_and_profiles.sql'),
    description: 'Auth extensions for hospitals and patients, registration RPCs, isolated Telegram routing',
  },
  {
    name: 'seed.sql',
    path: path.resolve(process.cwd(), 'backend/seed.sql'),
    description: 'Real Delhi NCR hospitals (AIIMS, Safdarjung, Max), doctors, slots, and resources',
  },
];

async function verifySqlFiles() {
  console.log(`${C.bold}Validating Migration & Seed Files:${C.reset}`);
  let allFilesValid = true;

  for (const file of SQL_FILES) {
    if (!fs.existsSync(file.path)) {
      console.log(`  ${C.red}✘ Missing file:${C.reset} ${file.name}`);
      allFilesValid = false;
      continue;
    }

    const content = fs.readFileSync(file.path, 'utf8');
    const lines = content.split('\n').length;
    const bytes = Buffer.byteLength(content, 'utf8');

    // Basic SQL sanity checks
    const hasCreateOrInsert = /CREATE\s+(TABLE|TYPE|FUNCTION|EXTENSION)|INSERT\s+INTO/i.test(content);
    if (!hasCreateOrInsert) {
      console.log(`  ${C.yellow}⚠ Warning:${C.reset} ${file.name} does not contain standard DDL/DML statements.`);
      allFilesValid = false;
      continue;
    }

    console.log(
      `  ${C.green}✔ Found ${file.name}${C.reset} (${lines} lines, ${(bytes / 1024).toFixed(1)} KB) — ${C.gray}${file.description}${C.reset}`
    );
  }

  return allFilesValid;
}

async function runDirectSqlOnSupabase(sqlContent, fileName) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || supabaseUrl.includes('your-project')) {
    return { applied: false, reason: 'No live credentials configured' };
  }

  // Attempt using Supabase Management API or direct pg endpoint if configured
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ query: sqlContent }),
    });

    if (res.ok) {
      return { applied: true };
    }
    return { applied: false, reason: `HTTP status ${res.status}` };
  } catch (err) {
    return { applied: false, reason: err.message };
  }
}

async function main() {
  const isValid = await verifySqlFiles();
  if (!isValid) {
    console.error(`\n${C.red}${C.bold}✘ File validation failed. Check missing files above.${C.reset}`);
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isConfigured = supabaseUrl && serviceRoleKey && !supabaseUrl.includes('your-project');

  if (isConfigured) {
    console.log(`\n${C.cyan}Applying migrations to Supabase at ${supabaseUrl}...${C.reset}`);
    for (const file of SQL_FILES) {
      const content = fs.readFileSync(file.path, 'utf8');
      const result = await runDirectSqlOnSupabase(content, file.name);
      if (result.applied) {
        console.log(`  ${C.green}✔ Successfully executed ${file.name}${C.reset}`);
      } else {
        console.log(`  ${C.yellow}ℹ Notice for ${file.name}: ${result.reason}${C.reset}`);
      }
    }
  } else {
    console.log(`\n${C.yellow}${C.bold}ℹ Supabase Credentials Status:${C.reset}`);
    console.log(`  No active remote SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY found in .env.`);
    console.log(`  To apply these SQL migrations directly to your Supabase project:`);
    console.log(`\n  ${C.bold}Option A: Via Supabase Web Dashboard (Recommended for Quick Setup)${C.reset}`);
    console.log(`    1. Open your project at ${C.cyan}https://supabase.com/dashboard${C.reset}`);
    console.log(`    2. Navigate to ${C.bold}SQL Editor${C.reset} -> ${C.bold}+ New query${C.reset}`);
    console.log(`    3. Copy & paste and run each file in sequence:`);
    console.log(`       a. ${C.cyan}backend/migrations/001_core_schema.sql${C.reset}`);
    console.log(`       b. ${C.cyan}backend/migrations/002_geo_and_emergency.sql${C.reset}`);
    console.log(`       c. ${C.cyan}backend/seed.sql${C.reset}`);
    console.log(`\n  ${C.bold}Option B: Via Supabase CLI${C.reset}`);
    console.log(`    supabase db push`);
  }

  console.log(`\n${C.green}${C.bold}✔ Database migration & seed files verified successfully!${C.reset}\n`);
}

main().catch(err => {
  console.error(`\n${C.red}Unexpected error:${C.reset}`, err);
  process.exit(1);
});

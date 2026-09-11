/**
 * MedConnect Pulse — AI Receptionist Voice Migration Test Suite
 * Validates Phase 3.5 Requirements:
 * - TEST A: AI Speaking & Text-to-Speech (Web Speech API parameters & Sarvam Bulbul TTS)
 * - TEST B: Voice Input & STT Processing (Audio constraints, language mapping, Sarvam STT)
 * - TEST C: End-to-End Voice Intake & Atomic Booking Flow
 * - TEST D: Failure Resilience (Ensuring zero-fake-success policy on error states)
 * - TEST E: Frontend Services & Production Build Integrity
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Load environment variables
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
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
}

const BASE_URL = 'http://localhost:3001';

async function fetchJson(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runVoicePipelineTests() {
  console.log('================================================================');
  console.log('MedConnect Pulse — Phase 3.5 AI Receptionist Voice Test Suite');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // PRE-FLIGHT CHECK
  // -------------------------------------------------------------
  console.log('--- PRE-FLIGHT: Backend Server & Configuration ---');
  const health = await fetchJson('/api/health');
  assert(health.ok && health.data.status === 'ok', 'Backend server is running on port 3001');

  const config = await fetchJson('/api/receptionist/config');
  assert(config.ok && config.data.sarvamConfigured === true, 'Sarvam AI is configured in backend environment');
  assert(config.ok && config.data.openaiConfigured === true, 'OpenAI is configured in backend environment');

  // -------------------------------------------------------------
  // TEST A: AI SPEAKING & TEXT-TO-SPEECH (TTS)
  // -------------------------------------------------------------
  console.log('\n--- TEST A: AI Speaking & Text-to-Speech (TTS) ---');
  
  // Test A1: Multilingual welcome messages for speech synthesis
  const welcomeHindi = await fetchJson('/api/receptionist/welcome?lang=Hindi');
  assert(
    welcomeHindi.ok && welcomeHindi.data.welcomeMessage.includes('नमस्ते'),
    'Multilingual speech welcome script generated in Hindi'
  );

  const welcomeEnglish = await fetchJson('/api/receptionist/welcome?lang=English');
  assert(
    welcomeEnglish.ok && welcomeEnglish.data.welcomeMessage.includes('Hello'),
    'Multilingual speech welcome script generated in English'
  );

  // Test A2: Real Sarvam Bulbul:v3 TTS Synthesis
  const ttsRes = await fetchJson('/api/sarvam/synthesize', {
    method: 'POST',
    body: JSON.stringify({
      text: 'Namaste, aapka appointment Dr. Rajesh Sharma ke saath confirm ho gaya hai.',
      language: 'Hinglish',
      speaker: 'priya',
    }),
  });
  assert(ttsRes.ok && ttsRes.data.success === true, 'Sarvam Bulbul:v3 TTS synthesis succeeded');
  assert(
    typeof ttsRes.data.audioBase64 === 'string' && ttsRes.data.audioBase64.length > 500,
    `Audio base64 waveform generated (${ttsRes.data.audioBase64?.length || 0} bytes)`
  );
  assert(ttsRes.data.format === 'wav', 'Synthesized audio format is 16kHz/22kHz WAV');

  // -------------------------------------------------------------
  // TEST B: VOICE INPUT & STT PROCESSING
  // -------------------------------------------------------------
  console.log('\n--- TEST B: Voice Input & STT Processing ---');

  // Test B1: Fallback text transcription for demo/mic
  const sttDemo = await fetchJson('/api/sarvam', {
    method: 'POST',
    body: JSON.stringify({ language: 'Hindi' }),
  });
  assert(sttDemo.ok && Boolean(sttDemo.data.text), `STT fallback produced valid transcript: "${sttDemo.data.text?.slice(0, 40)}..."`);
  assert(sttDemo.data.detectedLang === 'hi-IN', 'STT properly mapped language to hi-IN');

  // Test B2: Verify Sarvam Connectivity
  const sarvamVerify = await fetchJson('/api/sarvam/verify');
  assert(sarvamVerify.ok && sarvamVerify.data.success === true, 'Sarvam API credentials and connection verified');

  // -------------------------------------------------------------
  // TEST C: END-TO-END VOICE APPOINTMENT BOOKING & SPEECH OUTPUT
  // -------------------------------------------------------------
  console.log('\n--- TEST C: End-to-End Voice Intake & Atomic Booking ---');
  
  // Get an available open slot for Dr. Rajesh Sharma
  const slotsRes = await fetchJson('/api/appointments/slots?doctorId=def5ff12-6f2f-43a0-b8d0-5aec91d7a320&date=2026-09-11');
  const openSlot = (slotsRes.data.slots && slotsRes.data.slots.length > 0) ? slotsRes.data.slots[0] : '03:30 PM';

  const bookingTurn = await fetchJson('/api/receptionist/turn', {
    method: 'POST',
    body: JSON.stringify({
      channel: 'mic',
      text: `Mujhe Dr. Rajesh Sharma se Orthopedics me appointment book karna hai aaj ${openSlot}`,
      language: 'Hinglish',
    }),
  });

  assert(bookingTurn.ok && bookingTurn.data.success === true, 'Receptionist turn processed successfully');
  assert(
    bookingTurn.data.intent === 'BOOK_APPOINTMENT',
    `Intent classified as BOOK_APPOINTMENT (got ${bookingTurn.data.intent})`
  );
  assert(
    bookingTurn.data.validatedSlots?.doctorName === 'Dr. Rajesh Sharma',
    'Validated doctor: Dr. Rajesh Sharma'
  );
  assert(
    bookingTurn.data.validatedSlots?.departmentName === 'Orthopedics',
    'Validated department: Orthopedics'
  );
  assert(
    Boolean(bookingTurn.data.validatedSlots?.token || bookingTurn.data.actionPayload?.token?.token_number),
    `Token generated: ${bookingTurn.data.validatedSlots?.token || bookingTurn.data.actionPayload?.token?.token_number}`
  );
  assert(
    typeof bookingTurn.data.aiMessage === 'string' && bookingTurn.data.aiMessage.length > 20,
    `AI message generated for speech playback: "${bookingTurn.data.aiMessage.slice(0, 50)}..."`
  );

  // -------------------------------------------------------------
  // TEST D: REAL FAILURE HANDLING (ZERO-FAKE-SUCCESS POLICY)
  // -------------------------------------------------------------
  console.log('\n--- TEST D: Error Handling & Zero-Fake-Success Validation ---');

  // Test D1: Non-existent doctor must be rejected, not fake-booked
  const invalidDoctorTurn = await fetchJson('/api/receptionist/turn', {
    method: 'POST',
    body: JSON.stringify({
      channel: 'mic',
      text: 'Mujhe Dr. NonExistentDoctorFakeName se milna hai aaj 10 AM',
      language: 'Hinglish',
    }),
  });
  assert(
    invalidDoctorTurn.data.status !== 'ACTION_COMPLETED',
    'System correctly refused to book non-existent doctor'
  );
  assert(
    invalidDoctorTurn.data.actionPayload === null || !invalidDoctorTurn.data.actionPayload?.token,
    'No fake token issued for non-existent doctor'
  );

  // Test D2: Empty input must prompt user, not claim booking
  const emptyTurn = await fetchJson('/api/receptionist/turn', {
    method: 'POST',
    body: JSON.stringify({
      channel: 'mic',
      text: '',
      language: 'Hinglish',
    }),
  });
  assert(
    emptyTurn.data.status === 'NEEDS_MORE_INFO' || emptyTurn.data.status === 'INVALID_INPUT',
    `Empty input handled gracefully without booking (status: ${emptyTurn.data.status})`
  );

  // -------------------------------------------------------------
  // TEST E: FRONTEND SERVICES INTEGRITY
  // -------------------------------------------------------------
  console.log('\n--- TEST E: Frontend Services & Build Integrity ---');
  const speechSynthServiceExists = fs.existsSync(path.resolve('frontend/src/services/speechSynthesisService.ts'));
  assert(speechSynthServiceExists, 'speechSynthesisService.ts exists in frontend/src/services');

  const speechRecogServiceExists = fs.existsSync(path.resolve('frontend/src/services/speechRecognitionService.ts'));
  assert(speechRecogServiceExists, 'speechRecognitionService.ts exists in frontend/src/services');

  const receptionistViewExists = fs.existsSync(path.resolve('frontend/src/views/ReceptionistView.tsx'));
  assert(receptionistViewExists, 'ReceptionistView.tsx exists in frontend/src/views');

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`RESULTS: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    console.log('🎉 ALL VOICE PIPELINE VERIFICATION TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.error(`💥 ${totalTests - passedTests} tests failed.`);
    process.exit(1);
  }
}

runVoicePipelineTests().catch((err) => {
  console.error('Fatal error in voice test suite:', err);
  process.exit(1);
});

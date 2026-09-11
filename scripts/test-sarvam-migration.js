/**
 * MedConnect Pulse — Sarvam AI Integration Migration Test Suite
 * 
 * Verifies:
 * 1. Credential security & server-side isolation (no leak in config/responses)
 * 2. Missing credentials handling (SARVAM_NOT_CONFIGURED, no fake success)
 * 3. Invalid credentials rejection (HTTP 401/403)
 * 4. Real Sarvam Bulbul:v3 TTS audio synthesis
 * 5. Real Sarvam Saaras:v1 STT speech-to-text transcription
 * 6. End-to-End Pipeline: Voice Audio -> Sarvam STT -> Intent Extraction -> DB Action -> Response
 * 7. Real Failure Fallback: STT service failure cleanly reported with text-mode fallback
 * 8. Demo text fallback ONLY when no audio was provided
 * 9. Timeout handling via AbortController
 */

import fs from 'node:fs';
import path from 'node:path';
import { db } from '../backend/db.js';
import {
  getSarvamCredentials,
  transcribeAudio,
  synthesizeSpeech,
  verifySarvamConnection,
  LANGUAGE_CODE_MAP,
} from '../backend/services/sarvamService.js';
import {
  processReceptionistTurn,
  getReceptionistConfigStatus,
} from '../backend/services/receptionistService.js';

// Ensure environment variables are loaded
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

const originalApiKey = process.env.SARVAM_API_KEY;
const results = [];

function assert(condition, message, details = '') {
  const passed = Boolean(condition);
  results.push({ message, passed, details });
  const badge = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${badge}: ${message}`);
  if (details) console.log(`   └─ ${details}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('       MEDCONNECT PULSE — SARVAM AI INTEGRATION TEST SUITE      ');
  console.log('================================================================\n');

  // ------------------------------------------------------------------
  // TEST 1: CREDENTIAL SECURITY & ISOLATION
  // ------------------------------------------------------------------
  console.log('--- TEST 1: CREDENTIAL SECURITY & ISOLATION ---');
  const creds = getSarvamCredentials();
  assert(creds.isConfigured === true, 'Sarvam API key configured in server environment');
  assert(
    !JSON.stringify(getReceptionistConfigStatus()).includes(originalApiKey),
    'Config status endpoint NEVER returns or leaks the raw API key'
  );

  // ------------------------------------------------------------------
  // TEST 2: MISSING CREDENTIALS HANDLING (NO FAKE SUCCESS)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 2: MISSING CREDENTIALS (NO FAKE SUCCESS) ---');
  delete process.env.SARVAM_API_KEY;
  delete process.env.VITE_SARVAM_API_KEY;

  try {
    const missingStatus = getReceptionistConfigStatus();
    assert(
      missingStatus.sarvamConfigured === false && missingStatus.statusReport.includes('SARVAM_NOT_CONFIGURED'),
      'Correctly reports SARVAM_NOT_CONFIGURED when API key is missing'
    );

    const dummyAudio = Buffer.from('RIFF_DUMMY_AUDIO_DATA_FOR_TESTING');
    const missingStt = await transcribeAudio(dummyAudio, 'Hinglish');
    assert(
      missingStt.status === 'SARVAM_NOT_CONFIGURED' && missingStt.text === '',
      'Returns empty text and SARVAM_NOT_CONFIGURED when audio provided without key (no fake success)',
      `Status: ${missingStt.status}, text: "${missingStt.text}"`
    );

    const missingTurn = await processReceptionistTurn({
      audioBlob: dummyAudio,
      language: 'Hinglish',
    });
    assert(
      missingTurn.success === false && missingTurn.status === 'VOICE_TRANSCRIPTION_FAILED',
      'Receptionist turn reports VOICE_TRANSCRIPTION_FAILED on missing credentials',
      `Message: "${missingTurn.aiMessage}"`
    );
  } finally {
    process.env.SARVAM_API_KEY = originalApiKey;
  }

  // ------------------------------------------------------------------
  // TEST 3: INVALID CREDENTIALS / REJECTION (NO FAKE SUCCESS)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 3: INVALID KEY / REJECTION ---');
  const invalidConn = await verifySarvamConnection('sk_invalid_bogus_key_12345');
  assert(
    invalidConn.success === false && invalidConn.status === 'UNAUTHORIZED',
    'Rejects invalid API key with HTTP 401 UNAUTHORIZED',
    `Status: ${invalidConn.status}, Message: ${invalidConn.message}`
  );

  // ------------------------------------------------------------------
  // TEST 4: REAL SARVAM CONNECTIVITY & TEXT-TO-SPEECH (BULBUL:V3)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 4: REAL SARVAM TTS SYNTHESIS (BULBUL:V3) ---');
  const connVerify = await verifySarvamConnection();
  assert(
    connVerify.success === true,
    'Sarvam API connectivity verified with active SARVAM_API_KEY',
    connVerify.message
  );

  const ttsText = 'I need an appointment with Dr. Rajesh Sharma for Cardiology today at 11 AM';
  const ttsRes = await synthesizeSpeech({
    text: ttsText,
    language: 'English',
    speaker: 'priya',
  });

  assert(
    ttsRes.success === true && Boolean(ttsRes.audioBase64),
    'Sarvam TTS generated spoken audio successfully',
    `Audio payload size: ${ttsRes.audioBase64?.length || 0} base64 characters`
  );

  // ------------------------------------------------------------------
  // TEST 5: REAL SARVAM SPEECH-TO-TEXT TRANSCRIPTION (SAARAS:V1)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 5: REAL SARVAM STT TRANSCRIPTION (SAARAS:V1) ---');
  let synthesizedWavBuffer = null;
  if (ttsRes.audioBase64) {
    synthesizedWavBuffer = Buffer.from(ttsRes.audioBase64, 'base64');
  }

  const sttRes = await transcribeAudio(synthesizedWavBuffer, 'English');
  assert(
    sttRes.status === 'SUCCESS' && sttRes.text.length > 0,
    'Sarvam STT transcribed real speech audio successfully',
    `Transcript: "${sttRes.text}" | Confidence: ${sttRes.confidence} | Lang: ${sttRes.detectedLang}`
  );

  assert(
    sttRes.text.toLowerCase().includes('rajesh') || sttRes.text.toLowerCase().includes('cardio') || sttRes.text.toLowerCase().includes('appointment'),
    'Transcription accurately recognized medical domain keywords (Dr. Rajesh / Cardiology / appointment)',
    `Transcript: "${sttRes.text}"`
  );

  // ------------------------------------------------------------------
  // TEST 6: END-TO-END PIPELINE: VOICE AUDIO -> STT -> INTENT -> DB ACTION -> RESPONSE
  // ------------------------------------------------------------------
  console.log('\n--- TEST 6: END-TO-END VOICE RECEPTIONIST TURN ---');
  // Look up hospital
  const hospitals = await db.getHospitals();
  const hospitalId = hospitals[0]?.id;

  const voiceTurnRes = await processReceptionistTurn({
    channel: 'mic',
    audioBlob: synthesizedWavBuffer,
    language: 'English',
    hospitalId,
    context: {
      patientName: 'Test Patient Voice',
      patientPhone: '+919876543210',
    },
  });

  assert(
    voiceTurnRes.success === true,
    'End-to-End Voice Receptionist turn completed successfully',
    `Intent: ${voiceTurnRes.intent}, Status: ${voiceTurnRes.status}`
  );

  assert(
    voiceTurnRes.intent === 'BOOK_APPOINTMENT' || voiceTurnRes.intent === 'CHECK_DOCTOR_AVAILABILITY',
    'Voice turn parsed correct medical booking intent from Sarvam audio transcript',
    `Intent: ${voiceTurnRes.intent}`
  );

  assert(
    typeof voiceTurnRes.aiMessage === 'string' && voiceTurnRes.aiMessage.length > 0,
    'Receptionist returned valid conversational reply to patient',
    `AI Message: "${voiceTurnRes.aiMessage.slice(0, 80)}..."`
  );

  // ------------------------------------------------------------------
  // TEST 7: REAL FAILURE / FALLBACK STATE (SARVAM UNAVAILABLE)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 7: REAL FAILURE STATE WHEN SARVAM FAILS ---');
  // Pass an invalid buffer / corrupt audio that fails transcription
  const corruptAudio = Buffer.from('NOT_A_VALID_AUDIO_FILE');
  const failedStt = await transcribeAudio(corruptAudio, 'English', {
    model: 'saarika:v2.5',
    maxRetries: 1,
  });

  assert(
    failedStt.status === 'SARVAM_UNAVAILABLE' || failedStt.status === 'EMPTY_SPEECH',
    'Sarvam STT reports real failure status on invalid audio without faking success',
    `Status: ${failedStt.status}`
  );

  const fallbackTurn = await processReceptionistTurn({
    channel: 'mic',
    audioBlob: corruptAudio,
    language: 'English',
    hospitalId,
  });

  assert(
    fallbackTurn.success === false,
    'Receptionist reports real turn failure when speech transcription fails (no fake booking)',
    `Status: ${fallbackTurn.status}`
  );

  assert(
    fallbackTurn.status === 'VOICE_TRANSCRIPTION_FAILED' || fallbackTurn.status === 'EMPTY_SPEECH',
    'Correct failure status returned advising user to use text mode',
    `Message: "${fallbackTurn.aiMessage.slice(0, 70)}..."`
  );

  // ------------------------------------------------------------------
  // TEST 8: DEMO TEXT FALLBACK ONLY WHEN NO AUDIO PROVIDED
  // ------------------------------------------------------------------
  console.log('\n--- TEST 8: DEMO TEXT FALLBACK MODE ---');
  const demoFallback = await transcribeAudio(null, 'Hindi');
  assert(
    demoFallback.status === 'DEMO_FALLBACK' && demoFallback.text.length > 0,
    'Returns demo mock transcript ONLY when audio input is null/omitted',
    `Status: ${demoFallback.status}, Text: "${demoFallback.text.slice(0, 60)}..."`
  );

  // ------------------------------------------------------------------
  // TEST 9: TIMEOUT HANDLING VIA ABORT CONTROLLER
  // ------------------------------------------------------------------
  console.log('\n--- TEST 9: TIMEOUT HANDLING VIA ABORT CONTROLLER ---');
  const dummyBuffer = Buffer.from('RIFF_DUMMY_WAV_BYTES');
  const timeoutStart = Date.now();
  const timeoutRes = await transcribeAudio(dummyBuffer, 'Hinglish', {
    timeoutMs: 1, // Ultra-short timeout to trigger abort
    maxRetries: 1,
  });
  const elapsed = Date.now() - timeoutStart;
  assert(
    timeoutRes.status === 'SARVAM_UNAVAILABLE' && timeoutRes.text === '',
    'Correctly aborts on timeout and returns SARVAM_UNAVAILABLE',
    `Elapsed: ${elapsed}ms, Error: "${timeoutRes.error}"`
  );

  // ------------------------------------------------------------------
  // FINAL SUMMARY
  // ------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('                     TEST EXECUTION SUMMARY                     ');
  console.log('================================================================');
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log(`Total Tests Run : ${totalCount}`);
  console.log(`Passed          : ${passedCount}`);
  console.log(`Failed          : ${totalCount - passedCount}`);
  console.log('================================================================\n');

  if (passedCount < totalCount) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

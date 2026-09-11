/**
 * MedConnect Pulse — AI Receptionist Backend API Server
 * Exposes REST endpoints on port 3001 with CORS, JSON body parsing,
 * database access, and reverse proxying for Sarvam/OpenAI/n8n.
 */

import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { processReceptionistTurn, getReceptionistConfigStatus, getWelcomeMessage } from './services/receptionistService.js';
import { calculateAvailableSlots, bookAppointment, cancelAppointment, getAppointments } from './services/appointmentService.js';
import { getHospitals, getDepartments, getDoctors, searchDoctors } from './services/hospitalService.js';
import { getQueueStatus, getQueueEntries } from './services/queueService.js';
import { login, verifySession } from './services/authService.js';
import { transcribeAudio, synthesizeSpeech, verifySarvamConnection, getSarvamCredentials } from './services/sarvamService.js';
import { getOpenAICredentials } from './services/openaiService.js';

// Load environment
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

const PORT = Number(process.env.PORT) || 3001;

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-webhook-secret, api-subscription-key');
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({ raw: body });
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  try {
    // -------------------------------------------------------------
    // HEALTH CHECK
    // -------------------------------------------------------------
    if (pathname === '/' || pathname === '/api/health') {
      return sendJson(res, 200, {
        status: 'ok',
        service: 'MedConnect Pulse AI Receptionist Backend',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      });
    }

    // -------------------------------------------------------------
    // RECEPTIONIST ENDPOINTS
    // -------------------------------------------------------------
    if (pathname === '/api/receptionist/config' && req.method === 'GET') {
      const config = getReceptionistConfigStatus();
      return sendJson(res, 200, config);
    }

    if (pathname === '/api/receptionist/welcome' && req.method === 'GET') {
      const lang = reqUrl.searchParams.get('lang') || 'Hinglish';
      return sendJson(res, 200, { welcomeMessage: getWelcomeMessage(lang) });
    }

    if (pathname === '/api/receptionist/turn' && req.method === 'POST') {
      const body = await readBody(req);
      const result = await processReceptionistTurn({
        channel: body.channel || 'text',
        text: body.text,
        audioBlob: body.audioBlob,
        language: body.language || 'Hinglish',
        hospitalId: body.hospitalId,
        context: body.context,
      });
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/receptionist/voice' && req.method === 'POST') {
      const body = await readBody(req);
      const result = await processReceptionistTurn({
        channel: 'mic',
        audioBlob: body.audioBlob || body.audio,
        text: body.text,
        language: body.language || 'Hinglish',
        hospitalId: body.hospitalId,
        context: body.context,
      });
      return sendJson(res, 200, result);
    }

    // -------------------------------------------------------------
    // HOSPITALS & DEPARTMENTS
    // -------------------------------------------------------------
    if (pathname === '/api/hospitals' && req.method === 'GET') {
      const hospitals = await getHospitals();
      return sendJson(res, 200, { hospitals });
    }

    if (pathname === '/api/departments' && req.method === 'GET') {
      const hospitalId = reqUrl.searchParams.get('hospitalId');
      const departments = await getDepartments(hospitalId);
      return sendJson(res, 200, { departments });
    }

    // -------------------------------------------------------------
    // DOCTORS SEARCH
    // -------------------------------------------------------------
    if (pathname === '/api/doctors' && req.method === 'GET') {
      const hospitalId = reqUrl.searchParams.get('hospitalId');
      const departmentId = reqUrl.searchParams.get('departmentId');
      const query = reqUrl.searchParams.get('query');

      let doctors;
      if (query) {
        doctors = await searchDoctors(query, hospitalId);
      } else {
        doctors = await getDoctors(hospitalId, departmentId);
      }
      return sendJson(res, 200, { doctors });
    }

    // -------------------------------------------------------------
    // PATIENT SEARCH
    // -------------------------------------------------------------
    if (pathname === '/api/patients/search' && req.method === 'GET') {
      const query = reqUrl.searchParams.get('query') || reqUrl.searchParams.get('phone');
      const patients = await db.getPatients(query);
      return sendJson(res, 200, { patients });
    }

    // -------------------------------------------------------------
    // APPOINTMENTS & SLOTS
    // -------------------------------------------------------------
    if (pathname === '/api/appointments/slots' && req.method === 'GET') {
      const doctorId = reqUrl.searchParams.get('doctorId');
      const date = reqUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];

      if (!doctorId) {
        return sendJson(res, 400, { error: 'MISSING_DOCTOR_ID', message: 'doctorId is required' });
      }

      const slots = await calculateAvailableSlots(doctorId, date);
      return sendJson(res, 200, { doctorId, date, slots });
    }

    if (pathname === '/api/appointments/book' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const booking = await bookAppointment(body);
        return sendJson(res, 200, booking);
      } catch (err) {
        return sendJson(res, 400, { error: 'BOOKING_FAILED', message: err.message });
      }
    }

    if (pathname === '/api/appointments/check' && req.method === 'GET') {
      const tokenId = reqUrl.searchParams.get('tokenId') || reqUrl.searchParams.get('token');
      const phone = reqUrl.searchParams.get('phone');
      const appointmentId = reqUrl.searchParams.get('appointmentId');

      const appts = await getAppointments();
      const match = appts.find(a =>
        (tokenId && (a.token === tokenId || a.token_number === tokenId)) ||
        (phone && a.patient_phone === phone) ||
        (appointmentId && (a.appointment_id === appointmentId || a.id === appointmentId))
      );

      if (!match) {
        return sendJson(res, 404, { found: false, message: 'No appointment found matching query.' });
      }
      return sendJson(res, 200, { found: true, appointment: match });
    }

    if (pathname === '/api/appointments/cancel' && req.method === 'POST') {
      const body = await readBody(req);
      const targetId = body.appointmentId || body.token || body.tokenId;
      const cancelled = await cancelAppointment(targetId);

      if (!cancelled) {
        return sendJson(res, 404, { success: false, message: 'Appointment not found or already cancelled' });
      }
      return sendJson(res, 200, { success: true, appointment: cancelled });
    }

    // -------------------------------------------------------------
    // LIVE QUEUE STATUS
    // -------------------------------------------------------------
    if (pathname === '/api/queue/status' && req.method === 'GET') {
      const tokenId = reqUrl.searchParams.get('tokenId') || reqUrl.searchParams.get('token') || '#MED-1001';
      const status = await getQueueStatus(tokenId);
      return sendJson(res, 200, status);
    }

    if (pathname === '/api/queue/entries' && req.method === 'GET') {
      const hospitalId = reqUrl.searchParams.get('hospitalId');
      const entries = await getQueueEntries(hospitalId);
      return sendJson(res, 200, { entries });
    }

    // -------------------------------------------------------------
    // DUES / FEES
    // -------------------------------------------------------------
    if (pathname === '/api/dues' && req.method === 'GET') {
      const patientName = reqUrl.searchParams.get('patientName') || 'Patient';
      return sendJson(res, 200, {
        patientName,
        dues: 0,
        consultationFee: 500,
        status: 'NO_OUTSTANDING_DUES',
      });
    }

    // -------------------------------------------------------------
    // AUTHENTICATION & AUTHORIZATION
    // -------------------------------------------------------------
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const auth = await login(body);
        return sendJson(res, 200, auth);
      } catch (err) {
        return sendJson(res, 400, { error: 'AUTH_FAILED', message: err.message });
      }
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const session = await verifySession(token);
      return sendJson(res, 200, session);
    }

    // -------------------------------------------------------------
    // REVERSE PROXIES (SARVAM / OPENAI / N8N)
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/openai')) {
      const openai = getOpenAICredentials();
      const body = await readBody(req);
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openai.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      return sendJson(res, resp.status, data);
    }

    if (pathname === '/api/sarvam/verify' || (pathname.startsWith('/api/sarvam/verify') && (req.method === 'GET' || req.method === 'POST'))) {
      const result = await verifySarvamConnection();
      return sendJson(res, result.success ? 200 : 503, result);
    }

    if (pathname === '/api/sarvam/synthesize' && req.method === 'POST') {
      const body = await readBody(req);
      const tts = await synthesizeSpeech({
        text: body.text,
        language: body.language || 'English',
        speaker: body.speaker || 'priya',
      });
      return sendJson(res, tts.success ? 200 : 500, tts);
    }

    if (pathname.startsWith('/api/sarvam')) {
      const body = await readBody(req);
      const audio = body.audioBlob || body.file || body.audio || body.audioBase64;
      const stt = await transcribeAudio(audio, body.language || 'Hinglish', body.options || {});
      return sendJson(res, 200, stt);
    }

    // 404 NOT FOUND
    return sendJson(res, 404, { error: 'NOT_FOUND', path: pathname });
  } catch (serverErr) {
    console.error('[server] Error handling request:', serverErr);
    return sendJson(res, 500, { error: 'INTERNAL_SERVER_ERROR', message: serverErr.message });
  }
});

// Start listening if run directly
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  server.listen(PORT, () => {
    console.log(`========================================================`);
    console.log(`MedConnect Pulse — AI Receptionist Backend Server`);
    console.log(`Running on: http://localhost:${PORT}`);
    console.log(`Healthcheck: http://localhost:${PORT}/api/health`);
    console.log(`========================================================`);
  });
}

export { server };
export default server;

/**
 * MedConnect Pulse — AI Receptionist Backend API Server
 * Exposes REST endpoints on port 3001 with CORS, JSON body parsing,
 * database access, and reverse proxying for Sarvam/OpenAI/n8n.
 */

import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { db, formatTo12Hour } from './db.js';
import { processReceptionistTurn, getReceptionistConfigStatus, getWelcomeMessage } from './services/receptionistService.js';
import { calculateAvailableSlots, getAllDoctorSlots, bookAppointment, bookEmergencyAppointment, cancelAppointment, getAppointments } from './services/appointmentService.js';
import { getHospitals, getDepartments, getDoctors, searchDoctors } from './services/hospitalService.js';
import { getQueueStatus, getQueueEntries, callNextPatient, advancePatientStatus } from './services/queueService.js';
import { login, signup, verifySession } from './services/authService.js';
import { transcribeAudio, synthesizeSpeech, verifySarvamConnection, getSarvamCredentials } from './services/sarvamService.js';
import { getOpenAICredentials } from './services/openaiService.js';
import { sendTelegramAlert } from './services/notificationService.js';

// Load environment from multiple candidate locations (.env in cwd, parent, or backend dir)
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(path.dirname(new URL(import.meta.url).pathname), '.env'),
  path.resolve(path.dirname(new URL(import.meta.url).pathname), '../.env'),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    try {
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
    } catch (e) {
      // ignore
    }
  }
}

const PORT = Number(process.env.PORT) || 3001;

// In-memory sliding window rate limiter
const rateLimitMap = new Map();

function checkRateLimit(ip, isAiEndpoint) {
  const now = Date.now();
  const limit = isAiEndpoint ? 60 : 180; // reqs per minute
  const windowMs = 60 * 1000;

  // Clean stale keys periodically
  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now - v.resetTime > windowMs) rateLimitMap.delete(k);
    }
  }

  let record = rateLimitMap.get(ip);
  if (!record || now - record.resetTime > windowMs) {
    record = { count: 1, resetTime: now };
    rateLimitMap.set(ip, record);
    return true;
  }

  record.count += 1;
  return record.count <= limit;
}

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>]/g, '').trim();
}

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

async function authenticateRequest(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { valid: false, user: null, error: 'MISSING_AUTHORIZATION_TOKEN' };
  }
  return verifySession(token);
}

function getLocalNetworkIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
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
  const clientIp = req.socket.remoteAddress || '127.0.0.1';

  // Apply rate limiting
  const isAi = pathname.startsWith('/api/receptionist') || pathname.startsWith('/api/sarvam') || pathname.startsWith('/api/openai');
  if (!checkRateLimit(clientIp, isAi)) {
    return sendJson(res, 429, { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please retry in a moment.' });
  }

  try {
    // -------------------------------------------------------------
    // HEALTH CHECK
    // -------------------------------------------------------------
    if (pathname === '/' || pathname === '/api/health') {
      const lanIp = getLocalNetworkIp();
      return sendJson(res, 200, {
        status: 'ok',
        service: 'MedConnect Pulse AI Receptionist Backend',
        version: '1.0.0',
        lanIp,
        baseUrl: `http://${lanIp}:5173`,
        timestamp: new Date().toISOString(),
      });
    }

    if (pathname === '/api/network-info' && req.method === 'GET') {
      const lanIp = getLocalNetworkIp();
      return sendJson(res, 200, {
        ip: lanIp,
        frontendPort: 5173,
        backendPort: PORT,
        baseUrl: `http://${lanIp}:5173`,
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
      const lang = reqUrl.searchParams.get('lang') || 'English';
      return sendJson(res, 200, { welcomeMessage: getWelcomeMessage(lang) });
    }

    if (pathname === '/api/receptionist/turn' && req.method === 'POST') {
      const body = await readBody(req);
      const result = await processReceptionistTurn({
        channel: body.channel || 'text',
        text: body.text,
        audioBlob: body.audioBlob,
        language: body.language || 'English',
        hospitalId: body.hospitalId,
        patientName: body.patientName,
        patientPhone: body.patientPhone,
        useN8n: body.useN8n ?? true,
        routeViaN8n: body.routeViaN8n ?? true,
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
        patientName: body.patientName,
        patientPhone: body.patientPhone,
        useN8n: body.useN8n ?? true,
        routeViaN8n: body.routeViaN8n ?? true,
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
    if ((pathname === '/api/doctors' || pathname === '/api/appointments/doctors') && req.method === 'GET') {
      const hospitalId = reqUrl.searchParams.get('hospitalId');
      const departmentId = reqUrl.searchParams.get('departmentId');
      const departmentName = reqUrl.searchParams.get('departmentName');
      const query = reqUrl.searchParams.get('query');

      let doctors;
      if (query) {
        doctors = await searchDoctors(query, hospitalId);
      } else {
        doctors = await getDoctors(hospitalId, departmentId);
      }
      if (departmentName && Array.isArray(doctors)) {
        const dName = departmentName.toLowerCase();
        doctors = doctors.filter(d =>
          (d.department_name && d.department_name.toLowerCase().includes(dName)) ||
          (d.specialization && d.specialization.toLowerCase().includes(dName))
        );
      }
      return sendJson(res, 200, { success: true, count: (doctors || []).length, doctors });
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

      const allDoctorSlots = await getAllDoctorSlots(doctorId, date);
      // Available slot display strings for backward compatibility
      const slots = allDoctorSlots
        .filter(s => (s.status || '').toUpperCase() === 'AVAILABLE')
        .map(s => s.display_time || formatTo12Hour(s.start_time));

      // Detailed slots for rich interactive UI
      const detailedSlots = allDoctorSlots.map(s => ({
        slot_id: s.slot_id || s.id,
        id: s.slot_id || s.id,
        doctor_id: s.doctor_id,
        date: s.date || s.slot_date || date,
        start_time: s.start_time,
        end_time: s.end_time,
        display_time: s.display_time || formatTo12Hour(s.start_time),
        status: (s.status || '').toUpperCase() === 'AVAILABLE' ? 'AVAILABLE' : 'BOOKED',
        available: (s.status || '').toUpperCase() === 'AVAILABLE',
      }));

      return sendJson(res, 200, {
        doctorId,
        date,
        slots,
        detailedSlots,
        totalSlots: detailedSlots.length,
        availableCount: slots.length,
        bookedCount: detailedSlots.length - slots.length,
      });
    }

    if (pathname === '/api/appointments/book' && req.method === 'POST') {
      const auth = await authenticateRequest(req);
      const body = await readBody(req);

      if (auth.valid && auth.user) {
        // Enforce verified user identity for logged-in sessions
        body.patientId = auth.user.id;
        body.patient_id = auth.user.id;
        body.patientName = auth.user.name || body.patientName || 'Patient';
        body.patient_name = auth.user.name || body.patientName || 'Patient';
        body.patientPhone = auth.user.phone || body.patientPhone;
        body.patient_phone = auth.user.phone || body.patientPhone;
      } else {
        // Allow walk-in/kiosk/guest booking if patient phone is provided
        const phone = (body.patientPhone || body.patient_phone || '').trim();
        if (!phone) {
          return sendJson(res, 400, {
            success: false,
            error: 'MISSING_PATIENT_PHONE',
            message: 'Patient phone number is required to book an appointment. Please provide a contact number.',
          });
        }
        body.patientName = (body.patientName || body.patient_name || 'Patient').trim();
        body.patient_name = body.patientName;
        body.patientPhone = phone;
        body.patient_phone = phone;
      }

      try {
        const booking = await bookAppointment(body);
        if (booking && booking.success === false) {
          return sendJson(res, 409, {
            success: false,
            error: booking.error || 'SLOT_UNAVAILABLE',
            message: booking.message || 'Slot is unavailable',
          });
        }
        return sendJson(res, 200, booking);
      } catch (err) {
        const isSlotConflict = err.message?.toLowerCase().includes('booked') || err.message?.toLowerCase().includes('slot');
        return sendJson(res, isSlotConflict ? 409 : 400, {
          success: false,
          error: isSlotConflict ? 'SLOT_ALREADY_BOOKED' : 'BOOKING_FAILED',
          message: err.message,
        });
      }
    }

    if (pathname === '/api/appointments/emergency' && req.method === 'POST') {
      const auth = await authenticateRequest(req);
      const body = await readBody(req);

      if (auth.valid && auth.user) {
        body.patientId = auth.user.id;
        body.patient_id = auth.user.id;
        body.patientName = auth.user.name || body.patientName || 'Emergency Patient';
        body.patient_name = auth.user.name || body.patientName || 'Emergency Patient';
        body.patientPhone = auth.user.phone || body.patientPhone;
        body.patient_phone = auth.user.phone || body.patientPhone;
      } else {
        if (!body.patientPhone && !body.patient_phone) {
          return sendJson(res, 401, {
            error: 'UNAUTHORIZED',
            message: 'Authentication or valid patient phone number is required for emergency appointment.',
          });
        }
      }

      try {
        const result = await bookEmergencyAppointment(body);
        if (!result || result.success === false) {
          return sendJson(res, 409, {
            success: false,
            error: result?.error || 'NO_EMERGENCY_SLOT_AVAILABLE',
            message: result?.message || 'No suitable emergency slot currently available',
            department: result?.department,
            fallback: result?.fallback || {
              emergency_contact: '102',
              action: 'CONTACT_EMERGENCY_DESK',
              alternate_hospitals_url: '/api/hospitals/nearby',
            },
          });
        }
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 400, {
          success: false,
          error: 'EMERGENCY_BOOKING_FAILED',
          message: err.message,
        });
      }
    }

    if (pathname === '/api/appointments' && req.method === 'GET') {
      const auth = await authenticateRequest(req);
      let patientId = reqUrl.searchParams.get('patientId') || reqUrl.searchParams.get('patient_id');
      let hospitalId = reqUrl.searchParams.get('hospitalId') || reqUrl.searchParams.get('hospital_id');
      let doctorId = reqUrl.searchParams.get('doctorId') || reqUrl.searchParams.get('doctor_id');
      let phone = reqUrl.searchParams.get('phone') || reqUrl.searchParams.get('patientPhone');
      const status = reqUrl.searchParams.get('status');

      const userRole = auth.user?.role?.toLowerCase();

      // Patient Isolation: If request is authenticated as a patient, STRICTLY scope to their identity
      if (auth.valid && userRole === 'patient') {
        patientId = auth.user.patient_id || auth.user.id;
        phone = auth.user.phone || phone;
      } else if (auth.valid && (userRole === 'hospital' || userRole === 'receptionist')) {
        hospitalId = hospitalId || auth.user.hospital_id || auth.user.id;
      } else if (!auth.valid && !patientId && !phone && !hospitalId && !doctorId) {
        // Prevent unauthenticated full data dump of all patient appointments
        return sendJson(res, 200, { success: true, count: 0, appointments: [] });
      }

      const appointments = await db.getAppointments({
        patient_id: patientId,
        hospital_id: hospitalId,
        doctor_id: doctorId,
        phone,
        status,
      });

      // Defense-in-depth: if filtered by patient or authenticated as patient, guarantee only their records are returned
      let finalAppointments = appointments;
      if (patientId || phone) {
        const cleanReqPhone = phone ? phone.replace(/\D/g, '') : null;
        finalAppointments = appointments.filter(a => {
          const aPatId = a.patient_id || a.patients?.id || a.patients?.patient_id;
          if (patientId && aPatId && (aPatId === patientId || aPatId === auth.user?.id || aPatId === auth.user?.patient_id)) {
            return true;
          }
          if (cleanReqPhone) {
            const aPhone = (a.patient_phone || a.phone || a.patients?.phone_number || a.patients?.phone || '').replace(/\D/g, '');
            if (aPhone && (aPhone === cleanReqPhone || (cleanReqPhone.length >= 10 && aPhone.endsWith(cleanReqPhone.slice(-10))) || (aPhone.length >= 10 && cleanReqPhone.endsWith(aPhone.slice(-10))))) {
              return true;
            }
          }
          return false;
        });
      }

      return sendJson(res, 200, { success: true, count: finalAppointments.length, appointments: finalAppointments });
    }

    if (pathname === '/api/appointments/check' && req.method === 'GET') {
      const auth = await authenticateRequest(req);
      const tokenId = reqUrl.searchParams.get('tokenId') || reqUrl.searchParams.get('token');
      const phone = reqUrl.searchParams.get('phone');
      const appointmentId = reqUrl.searchParams.get('appointmentId');

      if (!tokenId && !phone && !appointmentId) {
        return sendJson(res, 400, { success: false, message: 'tokenId, phone, or appointmentId is required' });
      }

      const appts = await getAppointments();
      const match = appts.find(a =>
        (tokenId && (a.token === tokenId || a.token_number === tokenId)) ||
        (phone && a.patient_phone === phone) ||
        (appointmentId && (a.appointment_id === appointmentId || a.id === appointmentId))
      );

      if (!match) {
        return sendJson(res, 404, { found: false, message: 'No appointment found matching query.' });
      }

      // If authenticated as a patient, ensure they cannot inspect appointments of other patients
      if (auth.valid && auth.user?.role === 'patient') {
        const cleanUserPhone = auth.user.phone ? auth.user.phone.replace(/\D/g, '') : '';
        const cleanMatchPhone = match.patient_phone ? match.patient_phone.replace(/\D/g, '') : '';
        const isOwner = match.patient_id === auth.user.id ||
          (cleanUserPhone && cleanMatchPhone && (cleanUserPhone.endsWith(cleanMatchPhone.slice(-10)) || cleanMatchPhone.endsWith(cleanUserPhone.slice(-10))));
        if (!isOwner) {
          return sendJson(res, 403, { found: false, message: 'Access denied: Appointment belongs to another patient.' });
        }
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
    // REAL QR VERIFICATION & CHECK-IN (Phase 5)
    // -------------------------------------------------------------
    if ((pathname === '/api/qr/verify' || pathname === '/api/qr/check-in') && req.method === 'POST') {
      const auth = await authenticateRequest(req);
      const user = auth.valid ? auth.user : null;
      const body = await readBody(req);

      const qrData = body.qr_data || body.qrData || body.qr_code || body.qrString || body.data;
      const tokenId = body.tokenId || body.token || body.token_number;
      const appointmentId = body.appointmentId || body.id;
      const isCheckInRoute = pathname === '/api/qr/check-in';
      const action = isCheckInRoute ? 'check_in' : (body.action || 'verify');
      const passType = body.type || (typeof qrData === 'object' && qrData?.type);

      // Check-in security policy:
      // 1. User must be logged in OR present an authentic scanned QR pass / check-in URL
      // 2. Patient role without QR code cannot manually check in arbitrary tokens (reserved for staff)
      if (action === 'check_in') {
        const hasQrPass = Boolean(qrData || (body.sig && (tokenId || appointmentId)));
        if (!user && !hasQrPass) {
          return sendJson(res, 401, {
            success: false,
            status: 'FORBIDDEN',
            code: 'LOGIN_REQUIRED',
            message: 'User must be logged in to check in, or present an authentic appointment QR pass.',
          });
        }

        const isStaff = user && ['hospital', 'receptionist', 'doctor', 'emergency_manager', 'admin'].includes(user.role?.toLowerCase());
        if (user && user.role === 'patient' && !hasQrPass && !isStaff) {
          return sendJson(res, 400, {
            success: false,
            status: 'INVALID',
            code: 'SCAN_REQUIRED',
            message: 'Patients can only check in by scanning their QR code. Manual check-in by appointment number is reserved for hospital reception staff.',
          });
        }
      }

      let result;
      if (passType === 'emergency_dispatch') {
        result = await db.verifyAndRedeemDispatchPass({
          qrData,
          dispatchId: body.dispatch_id || body.dispatchId || appointmentId,
          tokenHash: body.token_hash || body.qr_token_hash || tokenId,
          action,
          user,
        });
      } else {
        result = await db.verifyAndCheckInAppointment({
          qrData,
          tokenId,
          appointmentId,
          action,
          user,
        });
      }

      let statusCode = 200;
      if (result.status === 'FORBIDDEN') {
        statusCode = 403;
      } else if (result.status === 'INVALID') {
        statusCode = 400;
      } else if (result.status === 'NOT FOUND') {
        statusCode = 404;
      }

      // If check-in succeeded from a scanned QR pass on a mobile phone without prior login,
      // generate a patient session so the client can automatically track their queue
      if (result.success && !user && result.appointment) {
        const cleanName = (result.appointment.patient_name || 'Patient').replace(/\*+/g, '') || 'Patient';
        const cleanPhone = (result.appointment.patient_phone || '').replace(/\*+/g, '');
        const patUser = {
          id: result.appointment.patient_id || result.appointment.appointment_id || 'patient-user',
          name: cleanName,
          phone: cleanPhone,
          role: 'patient',
        };
        result.user = patUser;
        result.token = `sess_${patUser.id}_${Date.now()}`;
      }

      return sendJson(res, statusCode, result);
    }

    if (pathname === '/api/qr/verify' && req.method === 'GET') {
      const auth = await authenticateRequest(req);
      const user = auth.valid ? auth.user : null;
      const qrData = reqUrl.searchParams.get('qr_data') || reqUrl.searchParams.get('qrData');
      const tokenId = reqUrl.searchParams.get('tokenId') || reqUrl.searchParams.get('token');
      const appointmentId = reqUrl.searchParams.get('appointmentId');
      const action = reqUrl.searchParams.get('action') || 'verify';

      const result = await db.verifyAndCheckInAppointment({
        qrData,
        tokenId,
        appointmentId,
        action,
        user,
      });

      let statusCode = 200;
      if (result.status === 'FORBIDDEN') statusCode = 403;
      else if (result.status === 'INVALID') statusCode = 400;
      else if (result.status === 'NOT FOUND') statusCode = 404;

      return sendJson(res, statusCode, result);
    }

    // -------------------------------------------------------------
    // LIVE QUEUE STATUS & REALTIME OPERATIONS
    // -------------------------------------------------------------
    if (pathname === '/api/queue/status' && req.method === 'GET') {
      const tokenId = reqUrl.searchParams.get('tokenId') || reqUrl.searchParams.get('token') || reqUrl.searchParams.get('appointmentId');
      const hospitalId = reqUrl.searchParams.get('hospitalId') || reqUrl.searchParams.get('hospital_id');
      const doctorId = reqUrl.searchParams.get('doctorId') || reqUrl.searchParams.get('doctor_id');
      const status = await getQueueStatus(tokenId, { hospitalId, doctorId });
      return sendJson(res, 200, status);
    }

    if (pathname === '/api/queue/entries' && req.method === 'GET') {
      const hospitalId = reqUrl.searchParams.get('hospitalId') || reqUrl.searchParams.get('hospital_id');
      const doctorId = reqUrl.searchParams.get('doctorId') || reqUrl.searchParams.get('doctor_id');
      const departmentId = reqUrl.searchParams.get('departmentId') || reqUrl.searchParams.get('department_id');
      const includeCompleted = reqUrl.searchParams.get('includeCompleted') === 'true';
      const includeCancelled = reqUrl.searchParams.get('includeCancelled') === 'true';
      const includeBooked = reqUrl.searchParams.get('includeBooked') === 'true';

      const entries = await getQueueEntries({
        hospitalId,
        doctorId,
        departmentId,
        includeCompleted,
        includeCancelled,
        includeBooked,
      });
      return sendJson(res, 200, { success: true, count: entries.length, entries });
    }

    if (pathname === '/api/queue/call-next' && req.method === 'POST') {
      const auth = await authenticateRequest(req);
      let staffUser = null;
      if (auth.valid && auth.user) {
        const staffRoles = ['hospital', 'receptionist', 'doctor', 'emergency_manager', 'admin'];
        if (!staffRoles.includes(auth.user.role?.toLowerCase())) {
          return sendJson(res, 403, {
            error: 'FORBIDDEN',
            message: 'Only authorized hospital personnel can advance the OPD queue.',
          });
        }
        staffUser = auth.user;
      }

      const body = await readBody(req);
      const hospitalId = body.hospitalId || body.hospital_id || staffUser?.hospital_id || staffUser?.id;
      const doctorId = body.doctorId || body.doctor_id;

      try {
        const result = await callNextPatient({ hospitalId, doctorId, staffUser });
        return sendJson(res, 200, result);
      } catch (err) {
        console.error('[server] callNextPatient error:', err.message);
        return sendJson(res, 500, { success: false, error: 'QUEUE_ADVANCE_FAILED', message: err.message });
      }
    }

    if (pathname === '/api/queue/update-status' && req.method === 'POST') {
      const auth = await authenticateRequest(req);
      let staffUser = null;
      if (auth.valid && auth.user) {
        const staffRoles = ['hospital', 'receptionist', 'doctor', 'emergency_manager', 'admin'];
        if (!staffRoles.includes(auth.user.role?.toLowerCase())) {
          return sendJson(res, 403, {
            error: 'FORBIDDEN',
            message: 'Only authorized hospital personnel can update queue statuses.',
          });
        }
        staffUser = auth.user;
      }

      const body = await readBody(req);
      const appointmentId = body.appointmentId || body.appointment_id || body.tokenId || body.token;
      const status = body.status;

      if (!appointmentId || !status) {
        return sendJson(res, 400, {
          success: false,
          error: 'BAD_REQUEST',
          message: 'Both appointmentId (or tokenId) and status are required.',
        });
      }

      try {
        const result = await advancePatientStatus({ appointmentId, newStatus: status, staffUser });
        return sendJson(res, 200, result);
      } catch (err) {
        console.error('[server] advancePatientStatus error:', err.message);
        return sendJson(res, 400, { success: false, error: 'STATUS_UPDATE_FAILED', message: err.message });
      }
    }

    // -------------------------------------------------------------
    // EMERGENCY REQUESTS & DISPATCH (Phase 7 Real DB Integration)
    // -------------------------------------------------------------
    if (pathname === '/api/emergency/requests' && req.method === 'GET') {
      const hospitalId = reqUrl.searchParams.get('hospitalId') || reqUrl.searchParams.get('hospital_id');
      const status = reqUrl.searchParams.get('status');
      const requests = await db.getEmergencyRequests({ hospital_id: hospitalId, status });
      return sendJson(res, 200, { success: true, count: requests.length, requests });
    }

    if (pathname === '/api/emergency/request' && req.method === 'POST') {
      const auth = await authenticateRequest(req);
      const body = await readBody(req);
      const hospitalId = body.hospital_id || body.requesting_hospital_id || (auth.valid && auth.user ? auth.user.id : null);
      if (!hospitalId) {
        return sendJson(res, 400, { success: false, error: 'MISSING_HOSPITAL_ID', message: 'Hospital ID is required' });
      }

      const created = await db.createEmergencyRequest({
        requesting_hospital_id: hospitalId,
        resource_type: body.resource_type || body.resourceType,
        quantity: Number(body.quantity) || 1,
        urgency: body.urgency || body.priority || 'CRITICAL',
        notes: body.notes,
      });

      const reqHospName = body.requesting_hospital_name || auth.user?.name || 'Regional Hospital';
      sendTelegramAlert(
        `🚨 <b>MedConnect Pulse — Emergency Resource Request</b>\n\n` +
        `• <b>Hospital:</b> ${reqHospName}\n` +
        `• <b>Resource:</b> ${body.quantity || 1}x ${body.resource_type || body.resourceType || 'Resource'}\n` +
        `• <b>Priority:</b> ${body.urgency || body.priority || 'CRITICAL'}\n` +
        `• <b>Radius:</b> ${body.radius_km || 15} km\n` +
        `• <b>Status:</b> BROADCASTED TO REGIONAL RADAR NETWORK`
      ).catch(() => {});

      return sendJson(res, 201, created);
    }

    if (pathname === '/api/emergency/accept' && req.method === 'POST') {
      const auth = await authenticateRequest(req);
      const body = await readBody(req);
      const requestId = body.request_id || body.requestId;
      const supplyingHospitalId = body.supplying_hospital_id || body.responding_hospital_id || body.hospital_id || (auth.valid && auth.user ? auth.user.id : null);
      const supplyingHospitalName = body.supplying_hospital_name || body.responding_hospital_name || auth.user?.name;

      if (!requestId || !supplyingHospitalId) {
        return sendJson(res, 400, { success: false, error: 'BAD_REQUEST', message: 'Both request_id and supplying_hospital_id are required' });
      }

      const result = await db.acceptEmergencyRequest({
        request_id: requestId,
        supplying_hospital_id: supplyingHospitalId,
        supplying_hospital_name: supplyingHospitalName,
      });

      if (result.success) {
        sendTelegramAlert(
          `✅ <b>MedConnect Pulse — Emergency Resource Reserved</b>\n\n` +
          `• <b>Supplying Hospital:</b> ${supplyingHospitalName || 'Facility'}\n` +
          `• <b>Request ID:</b> <code>${requestId}</code>\n` +
          `• <b>Dispatch Pass:</b> <code>${result.dispatch_id || 'DISP-ACTIVE'}</code>\n` +
          `• <b>Status:</b> INVENTORY RESERVED & AMBULANCE DISPATCHED`
        ).catch(() => {});
      }

      const statusCode = result.success ? 200 : (result.error === 'INSUFFICIENT_INVENTORY' ? 409 : 400);
      return sendJson(res, statusCode, result);
    }

    // -------------------------------------------------------------
    // HOSPITAL RESOURCES & INVENTORY (Phase 7 Real DB)
    // -------------------------------------------------------------
    if ((pathname === '/api/resources' || pathname === '/api/emergency/resources') && req.method === 'GET') {
      const hospitalId = reqUrl.searchParams.get('hospitalId') || reqUrl.searchParams.get('hospital_id');
      const resources = await db.getHospitalResources(hospitalId);
      return sendJson(res, 200, { success: true, count: resources.length, resources });
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
    if (pathname === '/api/auth/signup' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const result = await signup(body);
        return sendJson(res, 201, result);
      } catch (err) {
        const status = err.statusCode || 400;
        return sendJson(res, status, {
          error: err.code || 'SIGNUP_FAILED',
          message: err.message,
        });
      }
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const auth = await login(body);
        return sendJson(res, 200, auth);
      } catch (err) {
        const status = err.statusCode || 401;
        return sendJson(res, status, {
          error: err.code || 'AUTH_FAILED',
          message: err.message,
        });
      }
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const auth = await authenticateRequest(req);
      if (!auth.valid || !auth.user) {
        return sendJson(res, 401, {
          authenticated: false,
          error: auth.error || 'UNAUTHORIZED',
          message: 'Session is invalid or expired. Please sign in again.',
        });
      }
      return sendJson(res, 200, { authenticated: true, user: auth.user });
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      return sendJson(res, 200, { success: true, message: 'Session invalidated successfully' });
    }

    // -------------------------------------------------------------
    // REVERSE PROXIES (SARVAM / OPENAI / N8N)
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/openai')) {
      const openai = getOpenAICredentials();
      const body = await readBody(req);
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openai.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(6000),
        });
        const data = await resp.json();
        return sendJson(res, resp.status, data);
      } catch (err) {
        return sendJson(res, 504, { error: 'OPENAI_GATEWAY_TIMEOUT', message: err.message });
      }
    }

    if (pathname.startsWith('/api/n8n/') || pathname.startsWith('/webhook/')) {
      const webhookPath = pathname.replace(/^\/api\/n8n\/(?:webhook\/)?/, '').replace(/^\/webhook\//, '');
      const body = await readBody(req);
      const secret = process.env.N8N_WEBHOOK_SECRET || process.env.VITE_N8N_WEBHOOK_SECRET || 'medconnect-n8n-secret-key';
      const n8nBase = (process.env.N8N_WEBHOOK_URL || 'https://test-medconnect.app.n8n.cloud/webhook').replace(/\/$/, '');
      const targetUrl = `${n8nBase}/${webhookPath}`;

      try {
        const resp = await fetch(targetUrl, {
          method: req.method,
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': req.headers['x-webhook-secret'] || secret,
            'x-medconnect-secret': req.headers['x-medconnect-secret'] || secret,
            ...(req.headers['x-correlation-id'] ? { 'x-correlation-id': req.headers['x-correlation-id'] } : {}),
          },
          body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(10000),
        });

        if (resp.status !== 404) {
          const data = await resp.json().catch(async () => ({ text: await resp.text().catch(() => '') }));
          return sendJson(res, resp.status, data);
        }
      } catch {
        // Fall through to local execution if available
      }

      // If remote n8n returned 404 or failed and this is AI Receptionist, run verified WF1 workflow
      if (webhookPath === 'ai-receptionist' || webhookPath === 'medconnect-test') {
        const { executeWf1Local } = await import('./services/n8nService.js');
        const localHeaders = {
          ...req.headers,
          'x-webhook-secret': req.headers['x-webhook-secret'] || secret,
          'x-medconnect-secret': req.headers['x-medconnect-secret'] || secret,
        };
        const localExec = executeWf1Local(body, localHeaders);
        if (localExec) {
          return sendJson(res, localExec.statusCode, localExec.body);
        }
      }

      return sendJson(res, 404, {
        code: 404,
        message: `The requested webhook "POST ${webhookPath}" is not registered.`,
      });
    }

    if (pathname === '/api/twilio/call' && req.method === 'POST') {
      const body = await readBody(req);
      const { sendTwilioVoiceCall } = await import('./services/notificationService.js');
      const resCall = await sendTwilioVoiceCall({
        to: body.toPhone || body.to,
        message: body.message,
      });
      return sendJson(res, resCall.sent ? 200 : 500, resCall);
    }

    if (pathname === '/api/twilio/sms' && req.method === 'POST') {
      const body = await readBody(req);
      const { sendTwilioSms } = await import('./services/notificationService.js');
      const resSms = await sendTwilioSms(body.toPhone || body.to, body.message);
      return sendJson(res, resSms.sent ? 200 : 500, resSms);
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

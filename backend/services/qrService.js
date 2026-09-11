/**
 * QR Security & Anti-Tamper Service (MedConnect Pulse)
 * Generates and cryptographically verifies HMAC-SHA256 signed QR passes.
 * Zero Patient Health Information (PHI) is embedded in the unencrypted QR payload.
 */

import { createHmac } from 'node:crypto';

const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || 'medconnect_pulse_secure_qr_hmac_secret_key_2026';

/**
 * Deterministically serialize keys (excluding 'sig') to guarantee HMAC integrity
 */
export function canonicalStringify(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj = {};
  for (const k of sortedKeys) {
    if (k !== 'sig') {
      sortedObj[k] = obj[k];
    }
  }
  return JSON.stringify(sortedObj);
}

/**
 * Generate cryptographically signed QR payload for an appointment.
 * Zero Patient Health Information (PHI) is embedded.
 */
export function generateSignedAppointmentQR(payload, customTtlMs = 24 * 60 * 60 * 1000) {
  const issuedAt = new Date().toISOString();
  const exp = new Date(Date.now() + customTtlMs).toISOString();

  const data = {
    type: 'appointment_checkin',
    id: String(payload.appointment_id || payload.id || ''),
    token: String(payload.token || payload.token_number || ''),
    iat: issuedAt,
    exp,
  };

  const signature = createHmac('sha256', QR_SIGNING_SECRET)
    .update(canonicalStringify(data))
    .digest('hex');

  const signedPayload = {
    ...data,
    sig: signature,
  };

  return {
    rawPayload: signedPayload,
    qrString: JSON.stringify(signedPayload),
    token: data.token,
    id: data.id,
    exp: data.exp,
    sig: signature,
  };
}

/**
 * Generate cryptographically signed QR payload for an emergency dispatch pass.
 */
export function generateSignedDispatchQR(payload, customTtlMs = 60 * 60 * 1000) {
  const issuedAt = new Date().toISOString();
  const exp = new Date(Date.now() + customTtlMs).toISOString();

  const data = {
    type: 'emergency_dispatch',
    id: String(payload.dispatch_id || payload.id || ''),
    token: String(payload.qr_token_hash || payload.token || `PASS-${payload.dispatch_id || payload.id || 'EMERG'}`),
    request_id: String(payload.request_id || ''),
    iat: issuedAt,
    exp,
  };

  const signature = createHmac('sha256', QR_SIGNING_SECRET)
    .update(canonicalStringify(data))
    .digest('hex');

  const signedPayload = {
    ...data,
    sig: signature,
  };

  return {
    rawPayload: signedPayload,
    qrString: JSON.stringify(signedPayload),
    token: data.token,
    id: data.id,
    exp: data.exp,
    sig: signature,
  };
}

/**
 * Verify integrity and expiration of a signed QR payload.
 * Returns { valid: true, data } or { valid: false, error, status, data? }
 */
export function verifyQRPayload(qrInput) {
  try {
    let parsed;
    if (typeof qrInput === 'string') {
      const trimmed = qrInput.trim();
      // If user typed or scanned a plain token identifier (e.g. #MED-4030 or MED-4030)
      if (trimmed.startsWith('#') || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
        return { isRawToken: true, token: trimmed.startsWith('#') ? trimmed : `#${trimmed}` };
      }
      parsed = JSON.parse(trimmed);
    } else if (typeof qrInput === 'object' && qrInput !== null) {
      parsed = qrInput;
    } else {
      return { valid: false, error: 'INVALID_INPUT', status: 'INVALID' };
    }

    const { sig, ...data } = parsed;
    if (!sig) {
      return { valid: false, error: 'MISSING_SIGNATURE', status: 'INVALID' };
    }

    const expectedSignature = createHmac('sha256', QR_SIGNING_SECRET)
      .update(canonicalStringify(data))
      .digest('hex');

    if (sig !== expectedSignature) {
      return { valid: false, error: 'TAMPERED_OR_INVALID_SIGNATURE', status: 'INVALID' };
    }

    if (data.exp && new Date(data.exp).getTime() < Date.now()) {
      return { valid: false, error: 'QR_EXPIRED', status: 'EXPIRED', data };
    }

    return { valid: true, status: 'VALID', data };
  } catch (err) {
    return { valid: false, error: 'INVALID_QR_FORMAT', status: 'INVALID' };
  }
}

export const verifyAppointmentQR = verifyQRPayload;

export default {
  generateSignedAppointmentQR,
  generateSignedDispatchQR,
  verifyQRPayload,
  verifyAppointmentQR,
  canonicalStringify,
};


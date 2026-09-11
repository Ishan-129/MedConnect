/**
 * QR Security & Anti-Tamper Service (MedConnect Pulse)
 * Signs appointment check-in QR codes with HMAC-SHA256 and validates integrity.
 */

import { createHmac } from 'node:crypto';

const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || 'medconnect_pulse_secure_qr_hmac_secret_key_2026';

export function generateSignedAppointmentQR(payload) {
  const issuedAt = new Date().toISOString();
  const exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const data = {
    type: 'appointment_checkin',
    appointment_id: payload.appointment_id || payload.id,
    token: payload.token || payload.token_number,
    doctor: payload.doctor_name || payload.doctor,
    date: payload.appointment_date || payload.date,
    time: payload.appointment_time || payload.time,
    issued_at: issuedAt,
    exp,
  };

  const serialized = JSON.stringify(data);
  const signature = createHmac('sha256', QR_SIGNING_SECRET)
    .update(serialized)
    .digest('hex');

  const signedPayload = {
    ...data,
    sig: signature,
  };

  return {
    rawPayload: signedPayload,
    qrString: JSON.stringify(signedPayload),
  };
}

export function verifyAppointmentQR(qrString) {
  try {
    const parsed = typeof qrString === 'string' ? JSON.parse(qrString) : qrString;
    const { sig, ...data } = parsed;

    if (!sig) return { valid: false, error: 'MISSING_SIGNATURE' };

    const expectedSignature = createHmac('sha256', QR_SIGNING_SECRET)
      .update(JSON.stringify(data))
      .digest('hex');

    if (sig !== expectedSignature) {
      return { valid: false, error: 'TAMPERED_QR' };
    }

    if (data.exp && new Date(data.exp) < new Date()) {
      return { valid: false, error: 'QR_EXPIRED' };
    }

    return { valid: true, data };
  } catch (err) {
    return { valid: false, error: 'INVALID_QR_FORMAT' };
  }
}

export default {
  generateSignedAppointmentQR,
  verifyAppointmentQR,
};

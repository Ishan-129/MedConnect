import fs from 'node:fs';
import path from 'node:path';

// Ensure .env is loaded in process.env
if (typeof process !== 'undefined' && process.env) {
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
}

function getTelegramConfig() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_ALERT_CHAT_ID || process.env.TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_CHAT_ID || '').trim();
  return { token, chatId, isConfigured: Boolean(token && chatId) };
}

function getTwilioConfig() {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || process.env.VITE_TWILIO_ACCOUNT_SID || '').trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || process.env.VITE_TWILIO_AUTH_TOKEN || '').trim();
  const fromNumber = (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_FROM_PHONE || process.env.VITE_TWILIO_FROM_NUMBER || process.env.VITE_TWILIO_FROM_PHONE || '').trim();
  const toPhone = (process.env.TWILIO_TO_PHONE || process.env.TWILIO_ESCALATION_TO_NUMBER || process.env.VITE_TWILIO_TO_PHONE || '').trim();
  return {
    accountSid,
    authToken,
    fromNumber,
    toPhone,
    isConfigured: Boolean(accountSid && authToken && fromNumber),
  };
}

export async function sendTelegramAlert(message, chatId) {
  const { token, chatId: defaultChatId } = getTelegramConfig();
  const targetChatId = chatId || defaultChatId;
  if (!token || !targetChatId) {
    return { sent: false, reason: 'TELEGRAM_NOT_CONFIGURED' };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: message,
        parse_mode: 'HTML',
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const json = await res.json();
      return { sent: true, messageId: json.result?.message_id };
    }
  } catch (err) {
    console.warn('[notificationService] Failed to send Telegram alert:', err.message);
  }

  return { sent: false, reason: 'NETWORK_OR_API_ERROR' };
}

/**
 * Dispatches an SMS via Twilio REST API
 */
export async function sendTwilioSms(to, message) {
  const config = getTwilioConfig();
  const targetPhone = to || config.toPhone;
  if (!config.isConfigured || !targetPhone) {
    return { sent: false, reason: 'TWILIO_NOT_CONFIGURED' };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
    const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', targetPhone);
    params.append('From', config.fromNumber);
    params.append('Body', message);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(4000),
    });

    const data = await res.json();
    if (res.ok && data.sid) {
      return { sent: true, sid: data.sid, status: data.status };
    }
    return { sent: false, reason: data.message || 'TWILIO_SMS_FAILED' };
  } catch (err) {
    console.warn('[notificationService] Twilio SMS error:', err.message);
    return { sent: false, reason: err.message };
  }
}

/**
 * Initiates an Emergency Voice Escalation Call via Twilio
 */
export async function sendTwilioVoiceCall({ to, message, twiml }) {
  const config = getTwilioConfig();
  const targetPhone = to || config.toPhone;
  if (!config.isConfigured || !targetPhone) {
    return { sent: false, reason: 'TWILIO_NOT_CONFIGURED' };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`;
    const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', targetPhone);
    params.append('From', config.fromNumber);
    
    if (twiml) {
      params.append('Twiml', twiml);
    } else {
      const speech = message || 'Emergency Alert from MedConnect Pulse. Immediate regional coordinator attention required.';
      params.append('Twiml', `<Response><Say voice="alice">${speech}</Say></Response>`);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(4000),
    });

    const data = await res.json();
    if (res.ok && data.sid) {
      return { sent: true, callSid: data.sid, status: data.status };
    }
    return { sent: false, reason: data.message || 'TWILIO_CALL_FAILED' };
  } catch (err) {
    console.warn('[notificationService] Twilio Voice call error:', err.message);
    return { sent: false, reason: err.message };
  }
}

export async function sendAppointmentConfirmation({ patientPhone, patientName, doctorName, date, time, token }) {
  const text = `🏥 <b>MedConnect Pulse — Appointment Confirmed</b>\n\nPatient: <b>${patientName}</b>\nDoctor: <b>${doctorName}</b>\nDate: <b>${date}</b>\nTime: <b>${time}</b>\nQueue Token: <code>${token}</code>\n\nPlease arrive 10 minutes before consultation.`;
  
  const telegramPromise = sendTelegramAlert(text);

  // If patient phone is given or fallback phone configured, send SMS
  const smsPhone = patientPhone || TWILIO_TO_PHONE;
  let smsPromise = Promise.resolve({ sent: false });
  if (smsPhone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    const smsBody = `MedConnect: Appointment confirmed for ${patientName} with Dr. ${doctorName} on ${date} at ${time}. Token: ${token}. Please arrive 10 min early.`;
    smsPromise = sendTwilioSms(smsPhone, smsBody);
  }

  const [telegramRes, smsRes] = await Promise.allSettled([telegramPromise, smsPromise]);
  return {
    telegram: telegramRes.status === 'fulfilled' ? telegramRes.value : { sent: false },
    sms: smsRes.status === 'fulfilled' ? smsRes.value : { sent: false },
  };
}

export async function triggerEmergencyEscalationCall({ hospitalName, resourceType, quantity, toPhone }) {
  const message = `Emergency Alert Escalation. Hospital ${hospitalName || 'MedConnect Facility'} has an unfulfilled critical request for ${quantity ? quantity + ' units of ' : ''}${resourceType || 'resources'}. 3 minute response timeout expired. Immediate coordinator dispatch required.`;
  return sendTwilioVoiceCall({
    to: toPhone || TWILIO_TO_PHONE,
    message,
  });
}

export default {
  sendTelegramAlert,
  sendTwilioSms,
  sendTwilioVoiceCall,
  sendAppointmentConfirmation,
  triggerEmergencyEscalationCall,
};

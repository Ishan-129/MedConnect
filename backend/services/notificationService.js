/**
 * Notification Service (MedConnect Pulse)
 * Dispatches Telegram alerts, SMS, and emergency broadcast messages.
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_ALERT_CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID || process.env.TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_CHAT_ID || '';

export async function sendTelegramAlert(message, chatId = TELEGRAM_ALERT_CHAT_ID) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    return { sent: false, reason: 'TELEGRAM_NOT_CONFIGURED' };
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
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

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || process.env.VITE_TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || process.env.VITE_TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_FROM_PHONE || process.env.VITE_TWILIO_FROM_NUMBER || process.env.VITE_TWILIO_FROM_PHONE || '';
const TWILIO_TO_PHONE = process.env.TWILIO_TO_PHONE || process.env.TWILIO_ESCALATION_TO_NUMBER || process.env.VITE_TWILIO_TO_PHONE || '';

/**
 * Dispatches an SMS via Twilio REST API
 */
export async function sendTwilioSms(to, message) {
  const targetPhone = to || TWILIO_TO_PHONE;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !targetPhone) {
    return { sent: false, reason: 'TWILIO_NOT_CONFIGURED' };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', targetPhone);
    params.append('From', TWILIO_FROM_NUMBER);
    params.append('Body', message);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
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
  const targetPhone = to || TWILIO_TO_PHONE;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !targetPhone) {
    return { sent: false, reason: 'TWILIO_NOT_CONFIGURED' };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', targetPhone);
    params.append('From', TWILIO_FROM_NUMBER);
    
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

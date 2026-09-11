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

export async function sendAppointmentConfirmation({ patientPhone, patientName, doctorName, date, time, token }) {
  const text = `🏥 <b>MedConnect Pulse — Appointment Confirmed</b>\n\nPatient: <b>${patientName}</b>\nDoctor: <b>${doctorName}</b>\nDate: <b>${date}</b>\nTime: <b>${time}</b>\nQueue Token: <code>${token}</code>\n\nPlease arrive 10 minutes before consultation.`;
  return sendTelegramAlert(text);
}

export default {
  sendTelegramAlert,
  sendAppointmentConfirmation,
};

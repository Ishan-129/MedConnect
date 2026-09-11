/**
 * MedConnect Pulse — Twilio Voice & SMS Escalation Service
 * Handles emergency voice call escalations and SMS alerts using environment credentials.
 */

export interface TwilioVoiceCallPayload {
  requestId?: string;
  reqNumber?: string;
  requestingHospitalName?: string;
  resourceType?: string;
  quantity?: number;
  toPhone?: string;
}

export interface TwilioCallRecord {
  id: string;
  requestId: string;
  callSid?: string;
  status: string;
  timestamp: string;
  failureReason?: string;
  toPhone?: string;
  fromPhone?: string;
  success: boolean;
}

export function getTwilioCredentials(): {
  accountSid: string;
  authToken: string;
  fromPhone: string;
  toPhone: string;
} {
  const env = (import.meta as any).env || {};
  const accountSid = (env.VITE_TWILIO_ACCOUNT_SID || '').trim();
  const authToken = (env.VITE_TWILIO_AUTH_TOKEN || '').trim();
  const fromPhone = (env.VITE_TWILIO_FROM_PHONE || env.VITE_TWILIO_FROM_NUMBER || '+17372212163').trim();
  const toPhone = (env.VITE_TWILIO_TO_PHONE || env.VITE_TWILIO_ESCALATION_TO_NUMBER || '+919354543523').trim();

  return {
    accountSid,
    authToken,
    fromPhone,
    toPhone,
  };
}

/**
 * Initiates an emergency voice escalation call via Twilio
 */
export async function initiateTwilioVoiceCall(
  payload: TwilioVoiceCallPayload
): Promise<TwilioCallRecord> {
  const { accountSid, authToken, fromPhone, toPhone: defaultToPhone } = getTwilioCredentials();
  const targetToPhone = payload.toPhone || defaultToPhone;
  const timestamp = new Date().toISOString();
  const reqId = payload.requestId || payload.reqNumber || 'em-unknown';

  if (!accountSid || !authToken) {
    console.warn('[twilioService] TWILIO_NOT_CONFIGURED: Missing VITE_TWILIO_ACCOUNT_SID or VITE_TWILIO_AUTH_TOKEN');
    return {
      id: `tw-rec-${Date.now()}`,
      requestId: reqId,
      status: 'TWILIO_NOT_CONFIGURED',
      timestamp,
      failureReason: 'TWILIO_NOT_CONFIGURED',
      success: false,
    };
  }

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
    const authHeader = 'Basic ' + btoa(`${accountSid}:${authToken}`);

    const params = new URLSearchParams();
    params.append('To', targetToPhone);
    params.append('From', fromPhone);
    params.append(
      'Twiml',
      `<Response><Say voice="alice">Emergency Alert Escalation from MedConnect Pulse. Requesting hospital ${
        payload.requestingHospitalName || 'Hospital'
      } requires urgent ${payload.quantity ? payload.quantity + ' units of ' : ''}${
        payload.resourceType || 'resources'
      }. 3 minute response timeout expired. Immediate coordinator dispatch required.</Say></Response>`
    );

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();
    if (response.ok && data.sid) {
      return {
        id: `tw-rec-${Date.now()}`,
        requestId: reqId,
        callSid: data.sid,
        status: data.status || 'INITIATED',
        timestamp,
        toPhone: targetToPhone,
        fromPhone,
        success: true,
      };
    } else {
      const failReason = data.message || data.error_message || 'Twilio API call failed';
      return {
        id: `tw-rec-${Date.now()}`,
        requestId: reqId,
        status: 'FAILED',
        timestamp,
        failureReason: failReason,
        success: false,
      };
    }
  } catch (err: any) {
    return {
      id: `tw-rec-${Date.now()}`,
      requestId: reqId,
      status: 'FAILED',
      timestamp,
      failureReason: err.message,
      success: false,
    };
  }
}

/**
 * Sends an SMS alert via Twilio
 */
export async function sendTwilioSms(
  to: string,
  message: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const { accountSid, authToken, fromPhone, toPhone: defaultToPhone } = getTwilioCredentials();
  const targetPhone = to || defaultToPhone;

  if (!accountSid || !authToken) {
    return { success: false, error: 'TWILIO_NOT_CONFIGURED' };
  }

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const authHeader = 'Basic ' + btoa(`${accountSid}:${authToken}`);

    const params = new URLSearchParams();
    params.append('To', targetPhone);
    params.append('From', fromPhone);
    params.append('Body', message);

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();
    if (response.ok && data.sid) {
      return { success: true, sid: data.sid };
    }
    return { success: false, error: data.message || 'SMS failed' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export default {
  getTwilioCredentials,
  initiateTwilioVoiceCall,
  sendTwilioSms,
};

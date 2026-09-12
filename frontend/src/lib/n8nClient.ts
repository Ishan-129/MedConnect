/**
 * MedConnect Pulse — Live n8n Cloud Webhook Client
 * Direct execution against https://test-medconnect.app.n8n.cloud
 * No mocks. No demos.
 */

const N8N_BASE_URL = import.meta.env.VITE_N8N_BASE_URL || 'https://test-medconnect.app.n8n.cloud';
const N8N_WEBHOOK_BASE = import.meta.env.VITE_N8N_WEBHOOK_URL || `${N8N_BASE_URL}/webhook`;
const N8N_SECRET = import.meta.env.VITE_N8N_WEBHOOK_SECRET || 'medconnect-n8n-secret-key';

export const N8N_ENDPOINTS = {
  EMERGENCY_BROADCAST: import.meta.env.VITE_N8N_EMERGENCY_WEBHOOK_URL || `${N8N_WEBHOOK_BASE}/emergency-broadcast`,
  EMERGENCY_ACCEPT: import.meta.env.VITE_N8N_EMERGENCY_ACCEPT_WEBHOOK_URL || `${N8N_WEBHOOK_BASE}/emergency-accept`,
  ESCALATION_CHECK: import.meta.env.VITE_N8N_ESCALATION_WEBHOOK_URL || `${N8N_WEBHOOK_BASE}/escalation-timeout-check`,
};

export function generateCorrelationId(prefix = 'MED'): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${dateStr}-${randStr}`;
}

export interface N8nBroadcastPayload {
  request_id?: string;
  hospital_id: string;
  requesting_hospital_name: string;
  resource_type: string;
  quantity: number;
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  latitude: number;
  longitude: number;
  radius_km: number;
  notes?: string;
  timeout_seconds?: number;
}

export interface N8nBroadcastResponse {
  success: boolean;
  status: string;
  request_id: string;
  correlation_id: string;
  hospitals_notified?: number;
  error?: string;
  message?: string;
}

export interface N8nAcceptPayload {
  request_id: string;
  responding_hospital_id: string;
  responding_hospital_name?: string;
  correlation_id?: string;
}

export interface N8nAcceptResponse {
  success: boolean;
  status: string;
  request_id: string;
  responding_hospital_id: string;
  dispatch_id?: string;
  qr_token_hash?: string;
  pass_status?: string;
  correlation_id: string;
  error?: string;
  conflict_code?: string;
  message?: string;
}

/**
 * Execute direct HTTP POST call to live n8n webhook
 */
async function postToN8n<T>(url: string, payload: Record<string, any>, timeoutMs = 12000): Promise<T> {
  const correlationId = payload.correlation_id || generateCorrelationId();
  const enriched = {
    ...payload,
    correlation_id: correlationId,
  };

  console.info(`[n8n Live Client] 🚀 Calling ${url}`, { correlationId, payload: enriched });

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
        'X-MedConnect-Secret': N8N_SECRET,
        'x-webhook-secret': N8N_SECRET,
      },
      body: JSON.stringify(enriched),
      signal: controller.signal,
    });

    clearTimeout(timeoutTimer);

    let data: any;
    try {
      data = await response.json();
    } catch {
      data = { raw_status: response.status, text: await response.text().catch(() => '') };
    }

    if (!response.ok) {
      console.warn(`[n8n Live Client] ⚠️ Webhook returned HTTP ${response.status}`, data);
      return {
        success: false,
        status: response.status === 409 ? 'CONFLICT' : 'ERROR',
        error: data?.error || data?.message || `HTTP_${response.status}`,
        message: data?.message || `n8n webhook error (${response.status})`,
        correlation_id: correlationId,
        ...data,
      } as T;
    }

    console.info(`[n8n Live Client] ✅ Webhook Success`, data);
    return {
      success: true,
      correlation_id: correlationId,
      ...data,
    } as T;
  } catch (err: any) {
    clearTimeout(timeoutTimer);
    console.error(`[n8n Live Client] ❌ Request failed:`, err);
    return {
      success: false,
      status: 'NETWORK_ERROR',
      error: err.name === 'AbortError' ? 'REQUEST_TIMEOUT' : err.message,
      message: err.name === 'AbortError' ? 'n8n webhook timed out after 12s' : err.message,
      correlation_id: correlationId,
    } as T;
  }
}

/**
 * Trigger WF08: Emergency Broadcast Webhook
 */
export async function triggerEmergencyBroadcast(payload: N8nBroadcastPayload): Promise<N8nBroadcastResponse> {
  const enrichedPayload = {
    ...payload,
    requesting_hospital_id: payload.hospital_id || (payload as any).requesting_hospital_id,
    requesting_hospital_name: payload.requesting_hospital_name || 'Emergency Center',
    resource_name: payload.resource_type,
    resource_type: payload.resource_type,
    urgency: payload.urgency || 'CRITICAL',
    quantity: payload.quantity || 1,
  };

  const res = await postToN8n<any>(N8N_ENDPOINTS.EMERGENCY_BROADCAST, enrichedPayload);
  if (res.success) {
    const rawData = res.data || {};
    const reqId = rawData.requestId || res.request_id || rawData.request_id || payload.request_id || '';
    const hospitalsCount = rawData.nearbyHospitalsFound ?? res.hospitals_notified ?? (Array.isArray(rawData.matches) ? rawData.matches.length : 1);
    return {
      success: true,
      status: 'BROADCASTED',
      request_id: reqId,
      correlation_id: res.correlation_id || generateCorrelationId(),
      hospitals_notified: hospitalsCount,
      message: res.message || 'Regional emergency broadcast successfully dispatched via n8n.',
    };
  }

  // Fallback candidate if primary endpoint failed
  if (N8N_ENDPOINTS.EMERGENCY_BROADCAST !== `${N8N_WEBHOOK_BASE}/emergency-broadcast`) {
    const fallbackRes = await postToN8n<any>(`${N8N_WEBHOOK_BASE}/emergency-broadcast`, enrichedPayload);
    if (fallbackRes.success) {
      const rawData = fallbackRes.data || {};
      const reqId = rawData.requestId || fallbackRes.request_id || rawData.request_id || payload.request_id || '';
      const hospitalsCount = rawData.nearbyHospitalsFound ?? fallbackRes.hospitals_notified ?? (Array.isArray(rawData.matches) ? rawData.matches.length : 1);
      return {
        success: true,
        status: 'BROADCASTED',
        request_id: reqId,
        correlation_id: fallbackRes.correlation_id || generateCorrelationId(),
        hospitals_notified: hospitalsCount,
        message: fallbackRes.message || 'Emergency broadcast dispatched via fallback n8n webhook.',
      };
    }
  }

  return {
    success: false,
    status: res.status || 'ERROR',
    request_id: payload.request_id || '',
    correlation_id: res.correlation_id || generateCorrelationId(),
    error: res.error || 'N8N_BROADCAST_FAILED',
    message: res.message || 'n8n emergency broadcast webhook failed to dispatch.',
  };
}

/**
 * Trigger WF09: Emergency Accept & Lock Webhook
 */
export async function triggerEmergencyAccept(payload: N8nAcceptPayload): Promise<N8nAcceptResponse> {
  const enriched = {
    ...payload,
    responding_hospital_id: payload.responding_hospital_id || (payload as any).supplying_hospital_id,
    supplying_hospital_id: payload.responding_hospital_id || (payload as any).supplying_hospital_id,
  };
  return postToN8n<N8nAcceptResponse>(N8N_ENDPOINTS.EMERGENCY_ACCEPT, enriched);
}

/**
 * Trigger WF07: Emergency Escalation Timeout Check
 */
export async function triggerEscalationCheck(payload: { request_id: string; hospital_name?: string; [key: string]: any }): Promise<any> {
  return postToN8n(N8N_ENDPOINTS.ESCALATION_CHECK, payload);
}

/**
 * Trigger Emergency Decline & Alert Escalation
 */
export async function triggerEmergencyDecline(payload: {
  request_id: string;
  declining_hospital_id: string;
  declining_hospital_name: string;
  reason?: string;
}): Promise<any> {
  try {
    const res = await fetch('/api/emergency/decline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error('[n8nClient] triggerEmergencyDecline error:', err);
    return { success: false, error: err.message };
  }
}


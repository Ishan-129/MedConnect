/**
 * Frontend AI Receptionist Service
 * Dispatches voice and text turns to backend /api/receptionist/turn.
 * Adheres strictly to zero-fake-success policy: errors are surfaced clearly.
 */

import { transcribeAudio } from './sarvamService';
import { extractIntentAndSlots } from './openaiService';
import type { ReceptionistIntentType } from './openaiService';

export interface ConversationContext {
  patientName?: string;
  patientPhone?: string;
  departmentId?: string;
  departmentName?: string;
  doctorId?: string;
  doctorName?: string;
  date?: string;
  timeSlot?: string;
  tokenId?: string;
  pendingIntent?: ReceptionistIntentType;
  missingSlots?: string[];
}

export interface ReceptionistInput {
  channel?: 'text' | 'mic' | 'whatsapp' | 'telegram';
  text?: string;
  audioBlob?: Blob | ArrayBuffer | string;
  language?: string;
  hospitalId?: string;
  context?: ConversationContext;
}

export interface ReceptionistResponse {
  success: boolean;
  status: 'ACTION_COMPLETED' | 'NEEDS_MORE_INFO' | 'INVALID_INPUT' | 'ERROR';
  intent: ReceptionistIntentType;
  transcript: string;
  aiMessage: string;
  spokenText?: string;
  configurationStatus: {
    sarvamConfigured: boolean;
    openaiConfigured: boolean;
    statusReport: string;
  };
  validatedSlots?: Record<string, any>;
  missingSlots?: string[];
  actionPayload?: any;
  context?: ConversationContext;
  suggestedActions?: { label: string; text: string; icon?: string }[];
  error?: string;
}

/**
 * Dispatches a receptionist turn to the backend /api/receptionist/turn.
 */
export async function processReceptionistTurn(input: ReceptionistInput): Promise<ReceptionistResponse> {
  // 1. Try backend server endpoint
  try {
    const res = await fetch('/api/receptionist/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        useN8n: true,
      }),
    });

    if (res.ok) {
      const data: ReceptionistResponse = await res.json();
      return data;
    } else {
      const errorText = await res.text().catch(() => 'Backend returned an error');
      console.warn(`[receptionistService] Backend returned HTTP ${res.status}:`, errorText);
      return {
        success: false,
        status: 'ERROR',
        intent: 'UNKNOWN',
        transcript: input.text || '',
        aiMessage: `Backend Service Error (HTTP ${res.status}): Please check backend server status.`,
        error: errorText,
        configurationStatus: {
          sarvamConfigured: false,
          openaiConfigured: false,
          statusReport: `HTTP_${res.status}`,
        },
      };
    }
  } catch (netErr: any) {
    console.warn('[receptionistService] Backend unreachable:', netErr?.message || netErr);
    
    // If backend is completely down, do NOT fake a successful booking!
    return {
      success: false,
      status: 'ERROR',
      intent: 'UNKNOWN',
      transcript: input.text || '',
      aiMessage: `Connection Error: Unable to reach AI Receptionist backend service (${netErr?.message || 'Network failure'}).`,
      error: netErr?.message || 'Network failure',
      configurationStatus: {
        sarvamConfigured: false,
        openaiConfigured: false,
        statusReport: 'BACKEND_UNREACHABLE',
      },
    };
  }
}

export default {
  processReceptionistTurn,
};

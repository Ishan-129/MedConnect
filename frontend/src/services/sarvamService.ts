/**
 * Sarvam AI STT & TTS Integration Service for Frontend
 * Calls /api/sarvam (STT) and /api/sarvam/synthesize (TTS) reverse proxies.
 */

export interface SarvamSTTResult {
  text: string;
  detectedLang: string;
  confidence: number;
  isConfigured: boolean;
  status: string;
}

export interface SarvamTTSResult {
  success: boolean;
  audioBase64?: string;
  format?: string;
  sampleRate?: number;
  durationEstimateSec?: number;
  error?: string;
}

const LANGUAGE_CODE_MAP: Record<string, string> = {
  Hinglish: 'hi-IN',
  Hindi:    'hi-IN',
  English:  'en-IN',
  Tamil:    'ta-IN',
  Telugu:   'te-IN',
  Bengali:  'bn-IN',
  Marathi:  'mr-IN',
  Punjabi:  'pa-IN',
  Gujarati: 'gu-IN',
  Kannada:  'kn-IN',
  Odia:     'or-IN',
  'hi-IN':  'hi-IN',
  'en-IN':  'en-IN',
  'ta-IN':  'ta-IN',
  'te-IN':  'te-IN',
  'bn-IN':  'bn-IN',
  'mr-IN':  'mr-IN',
};

export function getSarvamCredentials(): { apiKey: string; isConfigured: boolean } {
  let apiKey = '';
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    apiKey = (import.meta as any).env.VITE_SARVAM_API_KEY || '';
  }
  const trimmed = apiKey.trim();
  // Backend proxy (/api/sarvam) handles transcription and synthesis securely
  return { apiKey: trimmed, isConfigured: true };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Transcribes audio blob using backend Sarvam STT (saarika:v2.5) proxy.
 */
export async function transcribeAudio(
  audioBlob?: Blob | ArrayBuffer | string,
  language: string = 'English'
): Promise<SarvamSTTResult> {
  const langCode = LANGUAGE_CODE_MAP[language] || 'en-IN';

  if (audioBlob) {
    try {
      let payload: any = {};
      if (typeof audioBlob === 'string') {
        payload.audioBlob = audioBlob;
      } else if (audioBlob instanceof Blob) {
        payload.audioBlob = await blobToBase64(audioBlob);
      } else if (audioBlob instanceof ArrayBuffer) {
        const blob = new Blob([audioBlob], { type: 'audio/wav' });
        payload.audioBlob = await blobToBase64(blob);
      }

      payload.language = language;

      const res = await fetch('/api/sarvam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          text: data.text || data.transcript || '',
          detectedLang: data.detectedLang || data.language_code || langCode,
          confidence: typeof data.confidence === 'number' ? data.confidence : 0.95,
          isConfigured: true,
          status: data.status || 'SUCCESS',
        };
      } else {
        const errText = await res.text().catch(() => '');
        console.warn(`[sarvamService] STT returned HTTP ${res.status}:`, errText);
      }
    } catch (err: any) {
      console.warn('[sarvamService] Voice transcription request failed:', err?.message || err);
    }

    return {
      text: '',
      detectedLang: langCode,
      confidence: 0,
      isConfigured: true,
      status: 'VOICE_TRANSCRIPTION_FAILED',
    };
  }

  // No audio blob provided and no local text — return empty/unconfigured status.
  // The UI's voice pipeline will handle this by prompting the user to speak.
  const { isConfigured } = getSarvamCredentials();
  return {
    text: '',
    detectedLang: langCode,
    confidence: 0,
    isConfigured,
    status: isConfigured ? 'EMPTY_INPUT' : 'SARVAM_NOT_CONFIGURED',
  };
}

/**
 * Synthesize speech into base64 WAV using Sarvam Bulbul:v3 TTS (/api/sarvam/synthesize)
 */
export async function synthesizeSarvamSpeech(
  text: string,
  language: string = 'English',
  speaker: string = 'priya'
): Promise<SarvamTTSResult> {
  try {
    const res = await fetch('/api/sarvam/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language, speaker }),
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    } else {
      const err = await res.json().catch(() => ({ message: 'TTS Failed' }));
      return { success: false, error: err.message || `HTTP ${res.status}` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error during TTS synthesis' };
  }
}

export default {
  getSarvamCredentials,
  transcribeAudio,
  synthesizeSarvamSpeech,
};

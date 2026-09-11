/**
 * MedConnect Pulse — Sarvam AI Integration Service
 * 
 * Provides production-grade integration for:
 * 1. Sarvam Speech-to-Text (Saaras:v1 / Saarika:v2.5) with domain prompt biasing
 * 2. Sarvam Text-to-Speech (Bulbul:v3)
 * 3. Robust timeout handling (AbortController) & exponential backoff retries
 * 4. Comprehensive Indic language mapping
 * 5. Strict failure reporting (never hallucinate success if audio transcription fails)
 * 6. Server-side credential isolation (never logs or leaks API keys)
 */

import { Blob } from 'node:buffer';

// Full Sarvam API language code map (all supported Indic languages)
export const LANGUAGE_CODE_MAP = {
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
  Malayalam:'ml-IN',
};

// Medical domain prompt to bias Sarvam STT model toward hospital terminology & doctor names
export const MEDICAL_DOMAIN_PROMPT = 
  'Dr. Rajesh Sharma, Dr. Priya Ananth, Dr. Amit Patel, Dr. Vikram Malhotra, Dr. Sunita Rao, Dr. Ananya Roy, ' +
  'Cardiology, Orthopedics, Neurology, General Medicine, Pediatrics, Dermatology, OPD, appointment, ' +
  'token MED-101, token MED-102, ICU bed, ventilator, emergency';

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 1500;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Retrieves the configured Sarvam API key server-side.
 * SECURITY: Never logs the key, returns masked/boolean status.
 */
export function getSarvamCredentials() {
  let apiKey = '';
  if (typeof process !== 'undefined' && process.env) {
    apiKey = process.env.SARVAM_API_KEY || process.env.VITE_SARVAM_API_KEY || '';
  }
  const trimmed = apiKey.trim();
  return {
    apiKey: trimmed,
    isConfigured: Boolean(trimmed),
  };
}

// Fallback phrases used ONLY when no audio was provided (demo / simulation text mode)
const MOCK_TRANSCRIPTIONS = {
  Hinglish: [
    'Hi, mujhe Dr. Rajesh Sharma se Cardiology department me appointment chahiye today around 11 AM.',
    'Doctor Priya Ananth se Orthopedics me consultation slot book karna hai.',
    'Mujhe Dr. Amit Patel se General Medicine me OPD checkup chahiye.',
    'Dr. Vikram Malhotra se Neurology department me consultation book kar do.',
    'Mujhe Dr. Sunita Rao se Dermatology me appointment chahiye skin checkup ke liye.',
  ],
  Hindi: [
    'नमस्ते, मुझे आज डॉक्टर राजेश शर्मा से कार्डियोलॉजी में अपॉइंटमेंट बुक करना है।',
    'नमस्ते, मुझे डॉक्टर प्रिया अनंत से ऑर्थोपेडिक्स में चेकअप के लिए अपॉइंटमेंट चाहिए।',
    'मुझे डॉक्टर अमित पटेल से जनरल मेडिसिन में आज ही मिलना है।',
    'कृपया डॉक्टर विक्रम मल्होत्रा से न्यूरोलॉजी विभाग में अपॉइंटमेंट बुक कर दें।',
  ],
  English: [
    'Hello, I would like to schedule an OPD appointment with Dr. Rajesh Sharma in Cardiology for today at 11:00 AM.',
    'Can you please book me an appointment with Dr. Priya Ananth in Orthopedics?',
    'I want to schedule a visit with Dr. Amit Patel in General Medicine this afternoon.',
    'Please book an appointment with Dr. Vikram Malhotra in Neurology.',
  ],
  Tamil: [
    'வணக்கம், இன்று காலை 11 மணிக்கு டாக்டர் ராஜேஷ் சர்மாவுடன் கார்டியாலஜி சந்திப்பை பதிவு செய்ய விரும்புகிறேன்.',
    'டாக்டர் பிரியா அனந்துடன் எலும்பியல் சந்திப்பை பதிவு செய்யவும்.',
  ],
  Telugu: [
    'నమస్కారం, ఈ రోజు ఉదయం 11 గంటలకు కార్డియాలజీ విభాగంలో డాక్టర్ రాజేష్ శర్మతో అపాయింట్‌మెంట్ బుక్ చేయండి.',
    'డాక్టర్ ప్రియా అనంత్‌తో ఆర్థోపెడిక్స్‌లో అపాయింట్‌మెంట్ బుక్ చేయండి.',
  ],
  Bengali: [
    'নমস্কার, আজ সকাল ১১টায় কার্ডিওলজি বিভাগে ডাক্তার রাজেশ শর্মার সাথে অ্যাপয়েন্টমেন্ট বুক করতে চাই।',
    'ডাক্তার প্রিয়া অনন্তর সাথে অর্থোপেডিকসে অ্যাপয়েন্টমেন্ট বুক করুন।',
  ],
  Marathi: [
    'नमस्कार, आज सकाळी ११ वाजता कार्डिओलॉजी विभागात डॉ. राजेश शर्मा यांच्याशी अपॉइंटमेंट बुक करायची आहे.',
    'डॉ. प्रिया अनंत यांच्याशी ऑर्थोपेडिक्स विभागात अपॉइंटमेंट हवी आहे.',
  ],
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Normalizes varied audio input types into a standard Blob with filename & mimeType.
 */
function normalizeAudioData(audioData) {
  if (!audioData) return null;

  // Unwrap objects like { audioBlob: ... }, { audioBase64: ... }, { audio: ... }, or { file: ... }
  if (
    typeof audioData === 'object' &&
    !Buffer.isBuffer(audioData) &&
    !(audioData instanceof ArrayBuffer) &&
    !(typeof Blob !== 'undefined' && audioData instanceof Blob)
  ) {
    if (audioData.audioBlob) audioData = audioData.audioBlob;
    else if (audioData.audioBase64) audioData = audioData.audioBase64;
    else if (audioData.audio) audioData = audioData.audio;
    else if (audioData.file) audioData = audioData.file;
    else if (audioData.data && Array.isArray(audioData.data)) {
      audioData = Buffer.from(audioData.data);
    }
  }

  if (!audioData) return null;

  let buffer;
  let mimeType = 'audio/wav';
  let filename = 'audio.wav';

  if (typeof audioData === 'string') {
    if (audioData.startsWith('data:')) {
      const parts = audioData.split(',');
      const match = parts[0].match(/:(.*?);/);
      mimeType = match ? match[1] : 'audio/wav';
      buffer = Buffer.from(parts[1], 'base64');
    } else {
      // Raw base64 string
      buffer = Buffer.from(audioData, 'base64');
    }
  } else if (Buffer.isBuffer(audioData)) {
    buffer = audioData;
  } else if (audioData instanceof ArrayBuffer) {
    buffer = Buffer.from(audioData);
  } else if (typeof Blob !== 'undefined' && audioData instanceof Blob) {
    return {
      blob: audioData,
      filename: audioData.type?.includes('webm') ? 'audio.webm' : (audioData.type?.includes('ogg') ? 'audio.ogg' : 'audio.wav'),
    };
  } else if (audioData && typeof audioData === 'object' && audioData.data && Array.isArray(audioData.data)) {
    buffer = Buffer.from(audioData.data);
  }

  if (!buffer) return null;

  if (mimeType.includes('webm')) filename = 'audio.webm';
  else if (mimeType.includes('ogg')) filename = 'audio.ogg';
  else if (mimeType.includes('mp4') || mimeType.includes('m4a')) filename = 'audio.mp4';
  else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) filename = 'audio.mp3';

  return {
    blob: new Blob([buffer], { type: mimeType }),
    filename,
  };
}

/**
 * Performs Speech-to-Text transcription via Sarvam Saaras/Saarika STT.
 * Includes timeout handling, retry logic with exponential backoff, and medical domain prompts.
 *
 * @param {Blob|Buffer|ArrayBuffer|string} audioData - Audio payload (buffer or base64)
 * @param {string} [language='Hinglish'] - Language name or code
 * @param {Object} [options={}] - Optional configurations
 * @param {string} [options.model='saaras:v1'] - STT model to use
 * @param {string} [options.prompt] - Optional custom prompt biasing
 * @param {number} [options.timeoutMs=10000] - Request timeout
 * @param {number} [options.maxRetries=3] - Maximum retry count
 * @returns {Promise<Object>} Transcription result
 */
export async function transcribeAudio(audioData, language = 'Hinglish', options = {}) {
  const { apiKey, isConfigured } = getSarvamCredentials();
  const langCode = LANGUAGE_CODE_MAP[language] || language || 'hi-IN';
  const model = options.model || process.env.SARVAM_STT_MODEL || 'saarika:v2.5';
  const prompt = options.prompt !== undefined ? options.prompt : MEDICAL_DOMAIN_PROMPT;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries !== undefined ? options.maxRetries : MAX_RETRIES;

  // 1. If audio is provided, attempt real Sarvam API call
  if (audioData) {
    if (!isConfigured) {
      console.warn('[sarvamService] SARVAM_NOT_CONFIGURED: Missing SARVAM_API_KEY in environment');
      return {
        text: '',
        detectedLang: langCode,
        confidence: 0,
        isConfigured: false,
        status: 'SARVAM_NOT_CONFIGURED',
        error: 'SARVAM_API_KEY is missing from environment. Voice transcription unavailable.',
      };
    }

    const normalized = normalizeAudioData(audioData);
    if (!normalized) {
      return {
        text: '',
        detectedLang: langCode,
        confidence: 0,
        isConfigured: true,
        status: 'INVALID_AUDIO_FORMAT',
        error: 'Failed to normalize audio payload format.',
      };
    }

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const formData = new FormData();
        formData.append('file', normalized.blob, normalized.filename);
        formData.append('model', model);
        formData.append('language_code', langCode);
        formData.append('with_diacritics', 'false');
        if (prompt) {
          formData.append('prompt', prompt);
        }

        const response = await fetch('https://api.sarvam.ai/speech-to-text', {
          method: 'POST',
          headers: {
            'api-subscription-key': apiKey,
            'Connection': 'close',
          },
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.ok) {
          const data = await response.json();
          const transcript = (data.transcript || data.text || '').trim();

          if (transcript) {
            return {
              text: transcript,
              detectedLang: data.language_code || langCode,
              confidence: typeof data.confidence === 'number' ? data.confidence : 0.96,
              isConfigured: true,
              status: 'SUCCESS',
            };
          }

          // Audio was transmitted but API returned empty transcript (e.g. silence or background noise)
          return {
            text: '',
            detectedLang: data.language_code || langCode,
            confidence: 0,
            isConfigured: true,
            status: 'EMPTY_SPEECH',
            error: 'No clear speech detected in the audio payload.',
          };
        }

        const errStatus = response.status;
        const errText = await response.text().catch(() => '(no body)');

        // Check if retryable
        if (RETRYABLE_STATUS_CODES.has(errStatus) && attempt < maxRetries) {
          console.warn(`[sarvamService] Transient HTTP ${errStatus} on attempt ${attempt}/${maxRetries}. Retrying in ${RETRY_BACKOFF_MS * attempt}ms...`);
          await sleep(RETRY_BACKOFF_MS * attempt);
          continue;
        }

        lastError = new Error(`Sarvam STT HTTP ${errStatus}: ${errText}`);
        break; // Non-retryable error (e.g. 401, 403, 400)
      } catch (err) {
        clearTimeout(timer);
        const isAbort = err.name === 'AbortError';
        const msg = isAbort ? `Request timed out after ${timeoutMs}ms` : err.message;

        if (attempt < maxRetries) {
          console.warn(`[sarvamService] Network/Timeout error on attempt ${attempt}/${maxRetries}: ${msg}. Retrying...`);
          await sleep(RETRY_BACKOFF_MS * attempt);
          continue;
        }

        lastError = new Error(`Sarvam STT failed: ${msg}`);
      }
    }

    // When real audio was provided and failed, NEVER return mock success! Return clear failure state.
    console.error('[sarvamService] Real voice transcription failed:', lastError?.message);
    return {
      text: '',
      detectedLang: langCode,
      confidence: 0,
      isConfigured: true,
      status: 'SARVAM_UNAVAILABLE',
      error: lastError?.message || 'Sarvam AI speech service is currently unavailable.',
    };
  }

  // 2. Demo fallback: ONLY used if NO audio input was provided (e.g., text simulation buttons)
  const pool = MOCK_TRANSCRIPTIONS[language] || MOCK_TRANSCRIPTIONS['Hinglish'];
  const mockText = pool[Math.floor(Math.random() * pool.length)];

  return {
    text: mockText,
    detectedLang: langCode,
    confidence: isConfigured ? 0.90 : 0.85,
    isConfigured,
    status: isConfigured ? 'DEMO_FALLBACK' : 'SARVAM_NOT_CONFIGURED',
  };
}

/**
 * Synthesizes text into spoken audio using Sarvam Bulbul TTS (bulbul:v3).
 *
 * @param {Object} params
 * @param {string} params.text - Text to speak
 * @param {string} [params.language='English'] - Target language
 * @param {string} [params.speaker='priya'] - Speaker voice
 * @param {number} [params.timeoutMs=10000] - Request timeout
 * @returns {Promise<Object>} Synthesized audio base64 payload
 */
export async function synthesizeSpeech({
  text,
  language = 'English',
  speaker = 'priya',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = 2,
}) {
  const { apiKey, isConfigured } = getSarvamCredentials();
  const langCode = LANGUAGE_CODE_MAP[language] || language || 'en-IN';

  if (!isConfigured) {
    return {
      success: false,
      status: 'SARVAM_NOT_CONFIGURED',
      error: 'SARVAM_API_KEY is not configured for TTS.',
    };
  }

  if (!text || !text.trim()) {
    return {
      success: false,
      status: 'INVALID_INPUT',
      error: 'Text input is required for speech synthesis.',
    };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'api-subscription-key': apiKey,
          'Content-Type': 'application/json',
          'Connection': 'close',
        },
        body: JSON.stringify({
          inputs: [text.trim()],
          target_language_code: langCode,
          speaker: speaker || 'priya',
          model: 'bulbul:v3',
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json();
        const audios = data.audios || [];
        if (audios.length > 0 && audios[0]) {
          return {
            success: true,
            status: 'SUCCESS',
            audioBase64: audios[0],
            format: 'wav',
            mimeType: 'audio/wav',
            requestId: data.request_id,
          };
        }
      }

      const errStatus = response.status;
      const errBody = await response.text().catch(() => '(no body)');

      if (RETRYABLE_STATUS_CODES.has(errStatus) && attempt < maxRetries) {
        await sleep(RETRY_BACKOFF_MS * attempt);
        continue;
      }

      lastError = new Error(`Sarvam TTS HTTP ${errStatus}: ${errBody}`);
      break;
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err.name === 'AbortError';
      const msg = isAbort ? `TTS request timed out after ${timeoutMs}ms` : err.message;
      if (attempt < maxRetries) {
        await sleep(RETRY_BACKOFF_MS * attempt);
        continue;
      }
      lastError = new Error(`Sarvam TTS failed: ${msg}`);
    }
  }

  return {
    success: false,
    status: 'SARVAM_TTS_FAILED',
    error: lastError?.message || 'Sarvam TTS synthesis failed.',
  };
}

/**
 * Verifies connectivity to the Sarvam AI API using configured credentials.
 * SECURITY: Never returns the API key in result or logs.
 */
export async function verifySarvamConnection(customApiKey) {
  const apiKey = customApiKey ? customApiKey.trim() : getSarvamCredentials().apiKey;

  if (!apiKey) {
    return {
      success: false,
      status: 'SARVAM_NOT_CONFIGURED',
      message: 'SARVAM_API_KEY is not configured in environment.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Length': '0',
        'Connection': 'close',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    // In FastAPI, 400 with "body.file : Field required" proves authentication was successful!
    if (response.status === 400 || response.status === 200) {
      return {
        success: true,
        configured: true,
        status: 'CONNECTED',
        message: 'Sarvam AI Speech API connection verified successfully.',
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        status: 'UNAUTHORIZED',
        message: 'Sarvam API rejected the key: HTTP 401 Unauthorized.',
      };
    }

    return {
      success: false,
      status: `HTTP_${response.status}`,
      message: `Sarvam API returned HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      success: false,
      status: 'CONNECTION_ERROR',
      message: `Failed to connect to Sarvam API: ${err.message}`,
    };
  }
}

export default {
  LANGUAGE_CODE_MAP,
  MEDICAL_DOMAIN_PROMPT,
  getSarvamCredentials,
  transcribeAudio,
  synthesizeSpeech,
  verifySarvamConnection,
};

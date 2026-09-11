/**
 * MedConnect Pulse — Speech Synthesis & Audio Playback Service
 * 
 * Provides:
 * 1. Native Web Speech API (window.speechSynthesis) with Indic speech tuning
 *    (rate: 0.95, pitch: 1.05, volume: 1.0) and language mapping.
 * 2. Playback state tracking (speaking / idle) with lifecycle callbacks.
 * 3. Audio cue synthesis integration (start, stop, success tones).
 * 4. Interruption and cancellation handling (stopSpeaking).
 * 5. Fallback/Complementary Sarvam Bulbul:v3 TTS audio playback via HTML5 Audio.
 */

import { playAudioCue } from './speechRecognitionService';

// Language code map for Indian Speech Synthesis
const TTS_LANGUAGE_MAP: Record<string, string> = {
  'hi-IN':    'hi-IN',
  'en-IN':    'en-IN',
  'ta-IN':    'ta-IN',
  'te-IN':    'te-IN',
  'bn-IN':    'bn-IN',
  'mr-IN':    'mr-IN',
  'Hindi':    'hi-IN',
  'Hinglish': 'hi-IN',
  'English':  'en-IN',
  'Tamil':    'ta-IN',
  'Telugu':   'te-IN',
  'Bengali':  'bn-IN',
  'Marathi':  'mr-IN',
};

let currentAudio: HTMLAudioElement | null = null;
let isCurrentlySpeaking = false;

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

/**
 * Check if the browser supports native SpeechSynthesis
 */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Stop any currently active speech synthesis or audio playback
 */
export function stopSpeaking(): void {
  isCurrentlySpeaking = false;
  
  // Stop native browser speech synthesis
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.warn('[speechSynthesis] Error cancelling speech synthesis:', e);
    }
  }

  // Stop any HTML5 Audio element playing Sarvam TTS audio
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (e) {
      console.warn('[speechSynthesis] Error pausing audio element:', e);
    }
    currentAudio = null;
  }
}

/**
 * Speak text aloud using browser SpeechSynthesis or Sarvam Bulbul audio fallback
 */
export function speakText(
  text: string,
  lang: string = 'Hinglish',
  options: SpeakOptions = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    const cleanText = text?.trim();
    if (!cleanText) {
      resolve(false);
      return;
    }

    // Cancel any previous speech
    stopSpeaking();

    const {
      rate = 0.95,
      pitch = 1.05,
      volume = 1.0,
      onStart,
      onEnd,
      onError,
    } = options;

    if (!isSpeechSynthesisSupported()) {
      console.warn('[speechSynthesis] Web SpeechSynthesis API is not supported in this browser environment.');
      if (onError) onError(new Error('SpeechSynthesis not supported'));
      resolve(false);
      return;
    }

    try {
      const utt = new SpeechSynthesisUtterance(cleanText);
      const targetLangCode = TTS_LANGUAGE_MAP[lang] || 'hi-IN';
      utt.lang = targetLangCode;
      utt.rate = rate;
      utt.pitch = pitch;
      utt.volume = volume;

      // Optional: select an Indic accent voice if installed in browser
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(
          v => v.lang === targetLangCode || v.lang.replace('_', '-') === targetLangCode
        );
        if (preferredVoice) {
          utt.voice = preferredVoice;
        }
      }

      utt.onstart = () => {
        isCurrentlySpeaking = true;
        if (onStart) onStart();
      };

      utt.onend = () => {
        isCurrentlySpeaking = false;
        if (onEnd) onEnd();
        resolve(true);
      };

      utt.onerror = (event) => {
        isCurrentlySpeaking = false;
        // Ignore interrupted or canceled errors caused by stopSpeaking()
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
          console.warn('[speechSynthesis] Utterance error:', event.error);
          if (onError) onError(event);
        }
        if (onEnd) onEnd();
        resolve(false);
      };

      window.speechSynthesis.speak(utt);
    } catch (err: any) {
      console.error('[speechSynthesis] Exception while initiating speech:', err);
      isCurrentlySpeaking = false;
      if (onError) onError(err);
      resolve(false);
    }
  });
}

/**
 * Play synthesized Base64 audio returned by Sarvam Bulbul:v3 TTS
 */
export async function playBase64Audio(
  base64Audio: string,
  options: { onStart?: () => void; onEnd?: () => void; onError?: (err: any) => void } = {}
): Promise<boolean> {
  stopSpeaking();

  return new Promise((resolve) => {
    try {
      const audioSrc = base64Audio.startsWith('data:')
        ? base64Audio
        : `data:audio/wav;base64,${base64Audio}`;

      const audio = new Audio(audioSrc);
      currentAudio = audio;

      audio.onplay = () => {
        isCurrentlySpeaking = true;
        if (options.onStart) options.onStart();
      };

      audio.onended = () => {
        isCurrentlySpeaking = false;
        currentAudio = null;
        if (options.onEnd) options.onEnd();
        resolve(true);
      };

      audio.onerror = (e) => {
        isCurrentlySpeaking = false;
        currentAudio = null;
        if (options.onError) options.onError(e);
        resolve(false);
      };

      audio.play().catch(err => {
        console.warn('[speechSynthesis] Audio play was blocked or failed:', err);
        isCurrentlySpeaking = false;
        currentAudio = null;
        if (options.onError) options.onError(err);
        resolve(false);
      });
    } catch (err) {
      console.error('[speechSynthesis] Error loading base64 audio:', err);
      isCurrentlySpeaking = false;
      currentAudio = null;
      if (options.onError) options.onError(err);
      resolve(false);
    }
  });
}

/**
 * Get whether speech is currently playing
 */
export function getIsSpeaking(): boolean {
  return isCurrentlySpeaking;
}

export default {
  speakText,
  stopSpeaking,
  playBase64Audio,
  getIsSpeaking,
  isSpeechSynthesisSupported,
};

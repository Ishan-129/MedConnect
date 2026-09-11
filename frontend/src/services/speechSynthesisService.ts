/**
 * MedConnect Pulse — Speech Synthesis & Audio Playback Service
 * 
 * Provides:
 * 1. Web Audio API & HTML5 Audio playback for Sarvam Bulbul:v3 TTS with autoplay unlock.
 * 2. Rock-solid Web Speech API fallback with Indic accent & script-aware voice selection.
 * 3. Chrome GC prevention & resume() handling for zero-interruption speech.
 * 4. AudioContext unlock helper attached to user gestures (click/touch/mic button).
 * 5. Complete fallback chain: Web Audio -> HTML5 Audio -> Web Speech API -> graceful error.
 */

// Language code map for Indian Speech Synthesis
const TTS_LANGUAGE_MAP: Record<string, string> = {
  'hi-IN':    'hi-IN',
  'en-IN':    'en-IN',
  'ta-IN':    'ta-IN',
  'te-IN':    'te-IN',
  'bn-IN':    'bn-IN',
  'mr-IN':    'mr-IN',
  'Hindi':    'hi-IN',
  'Hinglish': 'en-IN', // For Web Speech, Hinglish text in Latin alphabet speaks best with en-IN
  'English':  'en-IN',
  'Tamil':    'ta-IN',
  'Telugu':   'te-IN',
  'Bengali':  'bn-IN',
  'Marathi':  'mr-IN',
};

// Global audio state
let sharedAudioCtx: AudioContext | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;
let currentAudioElement: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
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
 * Get or create the shared AudioContext for the application
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        sharedAudioCtx = new AudioCtx();
      }
    } catch (e) {
      console.warn('[speechSynthesis] Could not create AudioContext:', e);
    }
  }
  return sharedAudioCtx;
}

/**
 * Unlock AudioContext during a direct user gesture (click, tap, mic press)
 * This permanently bypasses the browser's transient autoplay restrictions.
 */
export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx) {
    if (ctx.state === 'suspended') {
      ctx.resume().catch((err) => {
        console.warn('[speechSynthesis] AudioContext resume failed:', err);
      });
    }
    // Play 1-sample silent sound to permanently unlock Web Audio in Safari & Chrome
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {}
  }

  // Pre-wake Web Speech API engine
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {
      // safe ignore
    }
  }
}

// Automatically attach unlock listeners to early user gestures
if (typeof window !== 'undefined') {
  const autoUnlock = () => {
    unlockAudioContext();
  };
  window.addEventListener('click', autoUnlock, { passive: true });
  window.addEventListener('touchstart', autoUnlock, { passive: true });
  window.addEventListener('keydown', autoUnlock, { passive: true });

  // Preload voice list in Chrome
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
}

/**
 * Stop any currently active speech synthesis, audio buffer, or audio element
 */
export function stopSpeaking(): void {
  isCurrentlySpeaking = false;

  // Stop Web Audio buffer source
  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
      currentSourceNode.disconnect();
    } catch {
      // safe ignore
    }
    currentSourceNode = null;
  }

  // Stop HTML5 Audio element
  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    } catch {
      // safe ignore
    }
    currentAudioElement = null;
  }

  // Stop native browser speech synthesis
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.warn('[speechSynthesis] Error cancelling speech synthesis:', e);
    }
  }

  activeUtterance = null;
  if (typeof window !== 'undefined') {
    (window as any).__activeSpeechUtterance = null;
  }
}

/**
 * Clean and convert base64 data string to ArrayBuffer safely
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/^data:audio\/[a-zA-Z0-9\-]+;base64,/, '').replace(/\s/g, '');
  const binaryString = window.atob(clean);
  const len = binaryString.length;
  const buffer = new ArrayBuffer(len);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return buffer;
}

/**
 * Convert base64 data string to Blob for HTML5 Audio playback
 */
function base64ToBlob(base64: string, mimeType = 'audio/wav'): Blob {
  const buffer = base64ToArrayBuffer(base64);
  return new Blob([buffer], { type: mimeType });
}

/**
 * Play synthesized Base64 audio returned by Sarvam Bulbul:v3 TTS.
 * 1. Tries HTML5 Audio Element with Blob URL first (instant hardware playback).
 * 2. Falls back to Web Audio API buffer node if HTML5 Audio is blocked by autoplay.
 * 3. Guarantees safety timeouts so audio state never hangs or freezes.
 */
export async function playBase64Audio(
  base64Audio: string,
  options: { onStart?: () => void; onEnd?: () => void; onError?: (err: any) => void } = {}
): Promise<boolean> {
  if (!base64Audio || typeof window === 'undefined') {
    return false;
  }

  stopSpeaking();

  // Attempt 1: HTML5 Audio with Object URL (Extremely reliable for WAV audio across Chrome, Safari, Edge)
  try {
    const blob = base64ToBlob(base64Audio, 'audio/wav');
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    currentAudioElement = audio;

    const played = await new Promise<boolean>((resolve) => {
      let isSettled = false;
      const cleanup = (success: boolean) => {
        if (isSettled) return;
        isSettled = true;
        isCurrentlySpeaking = false;
        if (currentAudioElement === audio) {
          currentAudioElement = null;
        }
        try {
          URL.revokeObjectURL(audioUrl);
        } catch {}
        if (success) {
          options.onEnd?.();
        }
        resolve(success);
      };

      audio.onplay = () => {
        isCurrentlySpeaking = true;
        options.onStart?.();
      };

      audio.onended = () => {
        cleanup(true);
      };

      audio.onerror = (e) => {
        console.warn('[speechSynthesis] HTML Audio playback error, falling back:', e);
        options.onError?.(e);
        cleanup(false);
      };

      // Play invocation
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((playErr) => {
          console.warn('[speechSynthesis] HTML Audio play blocked by browser autoplay policy:', playErr);
          cleanup(false);
        });
      }
    });

    if (played) {
      return true;
    }
  } catch (htmlAudioErr) {
    console.warn('[speechSynthesis] HTML Audio element error, attempting Web Audio API:', htmlAudioErr);
  }

  // Attempt 2: Web Audio API (Using unlocked AudioContext destination)
  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      if (ctx.state === 'running') {
        const arrayBuffer = base64ToArrayBuffer(base64Audio);
        const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
          ctx.decodeAudioData(arrayBuffer, resolve, reject);
        });

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        currentSourceNode = source;
        isCurrentlySpeaking = true;

        return await new Promise<boolean>((resolve) => {
          let ended = false;
          const finish = (success: boolean) => {
            if (ended) return;
            ended = true;
            isCurrentlySpeaking = false;
            currentSourceNode = null;
            if (success) options.onEnd?.();
            resolve(success);
          };

          source.onended = () => finish(true);

          // Safety timeout so it never hangs if onended doesn't fire
          const maxDurationMs = Math.max((audioBuffer.duration * 1000) + 1500, 3000);
          setTimeout(() => finish(true), maxDurationMs);

          try {
            options.onStart?.();
            source.start(0);
          } catch (startErr) {
            console.warn('[speechSynthesis] Web Audio source.start failed:', startErr);
            finish(false);
          }
        });
      }
    }
  } catch (webAudioErr) {
    console.warn('[speechSynthesis] Web Audio playback failed:', webAudioErr);
  }

  isCurrentlySpeaking = false;
  return false;
}

/**
 * Native Web Speech API fallback with Indic accent & script-aware voice selection.
 * Handles Chrome bugs: utterance garbage collection, cancel() race condition, and voice mapping.
 */
export function speakWithWebSpeech(
  cleanText: string,
  lang: string = 'Hinglish',
  options: SpeakOptions = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    const {
      rate = 0.95,
      pitch = 1.05,
      volume = 1.0,
      onStart,
      onEnd,
      onError,
    } = options;

    if (!isSpeechSynthesisSupported()) {
      console.warn('[speechSynthesis] Web SpeechSynthesis API is not supported in this browser.');
      onError?.(new Error('SpeechSynthesis not supported'));
      resolve(false);
      return;
    }

    try {
      // Resume paused synthesis if stuck
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      // Check script: does the text contain Devanagari or other Indic characters?
      const hasDevanagari = /[\u0900-\u097F]/.test(cleanText);
      const isTamil = /[\u0B80-\u0BFF]/.test(cleanText);
      const isTelugu = /[\u0C00-\u0C7F]/.test(cleanText);
      const isBengali = /[\u0980-\u09FF]/.test(cleanText);

      let targetLang = TTS_LANGUAGE_MAP[lang] || 'en-IN';

      // If the text is Latin script (English or Romanized Hinglish),
      // use 'en-IN' so systems without Hindi voice packs pronounce it properly!
      if (!hasDevanagari && !isTamil && !isTelugu && !isBengali) {
        targetLang = 'en-IN';
      }

      const utt = new SpeechSynthesisUtterance(cleanText);
      utt.lang = targetLang;
      utt.rate = rate;
      utt.pitch = pitch;
      utt.volume = volume;

      // Cancel any ongoing utterance before queuing the new one
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        if (window.speechSynthesis.speaking) {
          try {
            window.speechSynthesis.cancel();
          } catch {}
        }
        if (window.speechSynthesis.paused) {
          try {
            window.speechSynthesis.resume();
          } catch {}
        }
      }

      // Keep utterance in global scope to prevent Chrome V8 garbage collection bug
      activeUtterance = utt;
      (window as any).__activeSpeechUtterance = utt;

      // Voice resolution
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const exactVoice = voices.find(
          (v) => v.lang === targetLang || v.lang.replace('_', '-') === targetLang
        );
        const prefixVoice = voices.find((v) => v.lang.startsWith(targetLang.split('-')[0]));
        const indianEnglishVoice = voices.find(
          (v) => v.lang === 'en-IN' || v.lang.replace('_', '-') === 'en-IN' || v.name.toLowerCase().includes('india')
        );
        const englishVoice = voices.find((v) => v.lang.startsWith('en'));

        if (exactVoice) {
          utt.voice = exactVoice;
        } else if (targetLang === 'en-IN' && indianEnglishVoice) {
          utt.voice = indianEnglishVoice;
        } else if (prefixVoice) {
          utt.voice = prefixVoice;
        } else if (!hasDevanagari && englishVoice) {
          utt.voice = englishVoice;
          utt.lang = englishVoice.lang;
        }
      }

      utt.onstart = () => {
        isCurrentlySpeaking = true;
        onStart?.();
      };

      utt.onend = () => {
        isCurrentlySpeaking = false;
        activeUtterance = null;
        (window as any).__activeSpeechUtterance = null;
        onEnd?.();
        resolve(true);
      };

      utt.onerror = (event) => {
        isCurrentlySpeaking = false;
        activeUtterance = null;
        (window as any).__activeSpeechUtterance = null;
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
          console.warn('[speechSynthesis] Utterance error:', event.error);
          onError?.(event);
        }
        onEnd?.();
        resolve(false);
      };

      // Slight delay for Chrome audio subsystem readiness
      setTimeout(() => {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          window.speechSynthesis.speak(utt);
        } catch (speakErr) {
          console.error('[speechSynthesis] window.speechSynthesis.speak threw:', speakErr);
          isCurrentlySpeaking = false;
          activeUtterance = null;
          onError?.(speakErr);
          resolve(false);
        }
      }, 50);
    } catch (err) {
      console.error('[speechSynthesis] Exception while initiating Web Speech:', err);
      isCurrentlySpeaking = false;
      activeUtterance = null;
      onError?.(err);
      resolve(false);
    }
  });
}

/**
 * Speak text aloud using:
 * 1. Sarvam Bulbul:v3 TTS audio playback (via backend proxy)
 * 2. Seamless fallback to native Web Speech API if network, API, or audio element fails
 */
export async function speakText(
  text: string,
  lang: string = 'Hinglish',
  options: SpeakOptions = {}
): Promise<boolean> {
  const cleanText = text?.trim();
  if (!cleanText) {
    return false;
  }

  // Pre-unlock audio context
  unlockAudioContext();

  // 1. Try Sarvam Bulbul:v3 TTS via backend proxy
  try {
    const res = await fetch('/api/sarvam/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        language: lang,
        speaker: 'priya',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.audioBase64) {
        const played = await playBase64Audio(data.audioBase64, options);
        if (played) {
          return true;
        }
        console.warn('[speechSynthesis] Sarvam audio playback did not start, falling back to Web Speech API.');
      }
    }
  } catch (err) {
    console.warn('[speechSynthesis] Sarvam synthesis fetch failed, falling back to Web Speech API:', err);
  }

  // 2. Fallback to Native Web Speech API
  return await speakWithWebSpeech(cleanText, lang, options);
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
  speakWithWebSpeech,
  unlockAudioContext,
  getAudioContext,
  getIsSpeaking,
  isSpeechSynthesisSupported,
};

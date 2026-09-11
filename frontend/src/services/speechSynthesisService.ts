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
let isSpeechEnginePrimed = false;
let cachedVoices: SpeechSynthesisVoice[] = [];
let sarvamTtsUnavailableUntil = 0; // Cooldown timestamp if Sarvam TTS has no quota / fails

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
 * Preload and cache browser voices asynchronously.
 * Guarantees voices are available immediately on the very first attempt.
 */
export function ensureVoicesLoaded(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }

  if (cachedVoices.length > 0) {
    return Promise.resolve(cachedVoices);
  }

  const immediate = window.speechSynthesis.getVoices();
  if (immediate && immediate.length > 0) {
    cachedVoices = immediate;
    return Promise.resolve(cachedVoices);
  }

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      try {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      } catch {}
      const v = window.speechSynthesis.getVoices() || [];
      if (v.length > 0) {
        cachedVoices = v;
      }
      resolve(cachedVoices.length > 0 ? cachedVoices : v);
    };

    const onVoicesChanged = () => finish();

    try {
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged, { once: true });
    } catch {
      window.speechSynthesis.onvoiceschanged = onVoicesChanged;
    }

    // Safety timeout so it never blocks if the browser takes longer
    setTimeout(finish, 250);
  });
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
 * Unlock AudioContext, HTML5 Audio, and Web Speech during any user gesture.
 * This permanently bypasses the browser's transient autoplay restrictions.
 */
export function unlockAudioContext(): void {
  // 1. Web Audio context unlock
  const ctx = getAudioContext();
  if (ctx) {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
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

  // 2. HTML5 Audio pipeline unlock (instant silent WAV)
  try {
    const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silentAudio.volume = 0.01;
    const playPromise = silentAudio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          silentAudio.pause();
          silentAudio.currentTime = 0;
        })
        .catch(() => {});
    }
  } catch {}

  // 3. Web Speech API wake-up & prime
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      // Prime SpeechSynthesis engine on the very first gesture so attempt 1 never stalls
      if (!isSpeechEnginePrimed) {
        const primer = new SpeechSynthesisUtterance('');
        primer.volume = 0;
        primer.rate = 10;
        window.speechSynthesis.speak(primer);
        isSpeechEnginePrimed = true;
      }
    } catch {}

    // Populate voice cache eagerly
    ensureVoicesLoaded().catch(() => {});
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

  // Eagerly pre-load voices on module load
  if ('speechSynthesis' in window) {
    ensureVoicesLoaded().catch(() => {});
    window.speechSynthesis.onvoiceschanged = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) cachedVoices = v;
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
 * Handles Chrome bugs:
 * 1. Async voice loading (waits for voices if not loaded yet).
 * 2. Voice-lang mismatch (always syncs utt.lang to selectedVoice.lang).
 * 3. Chrome paused state / cancel deadlock (watchdog auto-resumes after 350ms).
 * 4. Chrome 15s bug (auto-resume interval).
 * 5. Safety timeout (guarantees resolve and resets speaking state so UI never hangs).
 */
export async function speakWithWebSpeech(
  cleanText: string,
  lang: string = 'Hinglish',
  options: SpeakOptions = {}
): Promise<boolean> {
  const {
    rate = 0.95,
    pitch = 1.0,
    volume = 1.0,
    onStart,
    onEnd,
    onError,
  } = options;

  if (!isSpeechSynthesisSupported()) {
    console.warn('[speechSynthesis] Web SpeechSynthesis API is not supported in this browser.');
    onError?.(new Error('SpeechSynthesis not supported'));
    return false;
  }

  // Ensure voices are loaded before proceeding
  const voices = await ensureVoicesLoaded();

  return new Promise((resolve) => {
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
      if (!hasDevanagari && !isTamil && !isTelugu && !isBengali) {
        targetLang = 'en-IN';
      }

      const utt = new SpeechSynthesisUtterance(cleanText);
      utt.rate = rate;
      utt.pitch = pitch;
      utt.volume = volume;

      // Cancel any ongoing utterance before queuing the new one
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
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

      // Intelligent Voice Resolution
      if (voices && voices.length > 0) {
        let selectedVoice: SpeechSynthesisVoice | null = null;

        if (hasDevanagari) {
          selectedVoice = voices.find(v =>
            v.lang === 'hi-IN' || v.lang.replace('_', '-') === 'hi-IN' || v.lang.startsWith('hi') ||
            v.name.toLowerCase().includes('hindi') || v.name.toLowerCase().includes('lekha')
          ) || null;
        } else if (isTamil) {
          selectedVoice = voices.find(v =>
            v.lang === 'ta-IN' || v.lang.replace('_', '-') === 'ta-IN' || v.lang.startsWith('ta') ||
            v.name.toLowerCase().includes('tamil')
          ) || null;
        } else if (isTelugu) {
          selectedVoice = voices.find(v =>
            v.lang === 'te-IN' || v.lang.replace('_', '-') === 'te-IN' || v.lang.startsWith('te') ||
            v.name.toLowerCase().includes('telugu')
          ) || null;
        } else if (isBengali) {
          selectedVoice = voices.find(v =>
            v.lang === 'bn-IN' || v.lang.replace('_', '-') === 'bn-IN' || v.lang.startsWith('bn') ||
            v.name.toLowerCase().includes('bengali')
          ) || null;
        }

        // Indian English voice match
        if (!selectedVoice) {
          selectedVoice = voices.find(v =>
            v.lang === 'en-IN' || v.lang.replace('_', '-') === 'en-IN' ||
            v.name.toLowerCase().includes('india') || v.name.toLowerCase().includes('rishi')
          ) || null;
        }

        // Target language prefix match
        if (!selectedVoice) {
          selectedVoice = voices.find(v => v.lang === targetLang || v.lang.replace('_', '-') === targetLang) ||
                          voices.find(v => v.lang.startsWith(targetLang.split('-')[0])) || null;
        }

        // Natural English voice fallback
        if (!selectedVoice && !hasDevanagari && !isTamil && !isTelugu && !isBengali) {
          selectedVoice = voices.find(v => v.lang.startsWith('en') && (
            v.name.toLowerCase().includes('samantha') ||
            v.name.toLowerCase().includes('google') ||
            v.name.toLowerCase().includes('natural') ||
            v.default
          )) || voices.find(v => v.lang.startsWith('en')) || null;
        }

        // Default voice fallback
        if (!selectedVoice) {
          selectedVoice = voices.find(v => v.default) || voices[0] || null;
        }

        if (selectedVoice) {
          utt.voice = selectedVoice;
          // CRUCIAL: Synchronize utterance lang with selected voice lang to prevent Chrome speech rejection
          utt.lang = selectedVoice.lang;
        } else {
          utt.lang = targetLang;
        }
      } else {
        utt.lang = targetLang;
      }

      let hasStarted = false;
      let isSettled = false;
      let watchdogTimer: any = null;
      let safetyTimer: any = null;
      let resumeInterval: any = null;

      const cleanup = (success: boolean) => {
        if (isSettled) return;
        isSettled = true;
        isCurrentlySpeaking = false;
        activeUtterance = null;
        if (typeof window !== 'undefined') {
          (window as any).__activeSpeechUtterance = null;
        }
        if (watchdogTimer) clearTimeout(watchdogTimer);
        if (safetyTimer) clearTimeout(safetyTimer);
        if (resumeInterval) clearInterval(resumeInterval);
        if (success) {
          options.onEnd?.();
        }
        resolve(success);
      };

      utt.onstart = () => {
        hasStarted = true;
        isCurrentlySpeaking = true;
        options.onStart?.();
      };

      utt.onend = () => {
        cleanup(true);
      };

      utt.onerror = (event) => {
        if (event.error === 'canceled' && !hasStarted) {
          console.warn('[speechSynthesis] Utterance canceled before start, resuming engine...');
          try {
            window.speechSynthesis.resume();
            window.speechSynthesis.speak(utt);
            return;
          } catch {}
        }
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
          console.warn('[speechSynthesis] Utterance error:', event.error);
          onError?.(event);
        }
        cleanup(false);
      };

      // Periodic resume to prevent Chrome 15s freeze bug
      resumeInterval = setInterval(() => {
        if (isCurrentlySpeaking && typeof window !== 'undefined' && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 3000);

      // Chrome Watchdog: If onstart hasn't fired within 350ms, wake engine via resume()
      watchdogTimer = setTimeout(() => {
        if (!hasStarted && typeof window !== 'undefined' && window.speechSynthesis) {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        }
      }, 350);

      // Safety timeout so UI never hangs in "Speaking..." forever
      const estimatedDurationMs = Math.max((cleanText.length / 7) * 1000 + 4000, 6000);
      safetyTimer = setTimeout(() => {
        if (!isSettled) {
          cleanup(true);
        }
      }, estimatedDurationMs);

      // Trigger speak with brief microtask delay so cancel() IPC completes
      setTimeout(() => {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          window.speechSynthesis.speak(utt);
        } catch (speakErr) {
          console.error('[speechSynthesis] window.speechSynthesis.speak threw:', speakErr);
          cleanup(false);
        }
      }, 20);
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
 * 2. Instant fallback to native Web Speech API if network, API, or audio element fails
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

  // Pre-unlock audio context synchronously
  unlockAudioContext();

  const now = Date.now();
  // If Sarvam TTS is in cooldown (e.g. 402 no quota), don't waste 300ms on a doomed fetch; speak immediately!
  const shouldTrySarvam = now > sarvamTtsUnavailableUntil;

  if (shouldTrySarvam) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800); // Strict 1.8s timeout

    try {
      const res = await fetch('/api/sarvam/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          language: lang,
          speaker: 'priya',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.audioBase64) {
          const played = await playBase64Audio(data.audioBase64, options);
          if (played) {
            return true;
          }
          console.warn('[speechSynthesis] Sarvam audio playback failed to start, falling back to Web Speech.');
        } else {
          // If Sarvam explicitly reported quota exhaustion or failure, cache cooldown for 45s
          if (data.status === 'SARVAM_NO_CREDITS' || (data.error && data.error.includes('402'))) {
            sarvamTtsUnavailableUntil = Date.now() + 45000;
          }
        }
      } else {
        if (res.status === 402 || res.status === 500) {
          sarvamTtsUnavailableUntil = Date.now() + 45000;
        }
      }
    } catch (err) {
      clearTimeout(timeout);
      // On network failure or abort, set short cooldown
      sarvamTtsUnavailableUntil = Date.now() + 20000;
      console.warn('[speechSynthesis] Sarvam TTS request failed or timed out, routing immediately to Web Speech:', err);
    }
  }

  // 2. Instant fallback to Native Web Speech API
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

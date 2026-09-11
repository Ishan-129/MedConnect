/**
 * MedConnect Pulse — Advanced Speech Recognition & Audio Capture Service
 * Provides:
 * 1. Native Web Speech API (SpeechRecognition / webkitSpeechRecognition) with dual-mode language support.
 * 2. Real-time microphone audio volume / decibel analyzer (AudioContext + AnalyserNode) for waveforms.
 * 3. Smart Voice Activity Detection (VAD) / Silence Auto-Stop to comfort users when they finish talking.
 * 4. Built-in Web Audio tone synthesizer chimes for tactile voice cues without external sound assets.
 * 5. MediaRecorder capture fallback for backend STT (Sarvam AI Saarika v2.5).
 */

export interface SpeechRecognitionOptions {
  language?: string;
  autoStopOnSilence?: boolean;
  silenceThresholdMs?: number;
  onInterimText?: (interim: string) => void;
  onFinalText?: (finalText: string) => void;
  onVolumeChange?: (volume: number) => void; // 0 to 100
  onSilenceDetected?: () => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export interface SpeechRecognitionController {
  stop: () => Promise<{ transcript: string; audioBlob: Blob | null }>;
  abort: () => void;
  getRecordedBlob: () => Blob | null;
}

// Language code map tailored for Indian speech recognition engines
// Note: For Hinglish and mixed Indian English, 'en-IN' is overwhelmingly superior
// in Chrome for catching doctor names, departments, and Romanized Hindi phonemes.
// 'hi-IN' is reserved for pure Devanagari Hindi.
const LANGUAGE_CODE_MAP: Record<string, string> = {
  Hinglish: 'en-IN',
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
};

/**
 * Play synthesizer chimes for user cues (zero asset dependencies)
 */
export function playAudioCue(type: 'start' | 'stop' | 'success') {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.08, now);

    if (type === 'start') {
      // Gentle ascending double chirp
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(740, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'stop') {
      // Gentle descending chime
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.24);
    } else if (type === 'success') {
      // Cheerful completion chime
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.08); // A5
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.3);
    }

    setTimeout(() => {
      try {
        ctx.close();
      } catch {}
    }, 400);
  } catch {
    // Ignore audio cue errors if Web Audio blocked
  }
}

// Check if browser has native speech recognition
export function isNativeSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

/**
 * Starts listening to the microphone with live speech recognition, silence detection & audio metering.
 */
export async function startListening(
  options: SpeechRecognitionOptions = {}
): Promise<SpeechRecognitionController> {
  const {
    language = 'Hinglish',
    autoStopOnSilence = true,
    silenceThresholdMs = 2000,
    onInterimText,
    onFinalText,
    onVolumeChange,
    onSilenceDetected,
    onError,
    onEnd,
  } = options;

  const langCode = LANGUAGE_CODE_MAP[language] || 'en-IN';

  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let animFrameId: number | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  const audioChunks: Blob[] = [];
  let recognition: any = null;

  let accumulatedFinal = '';
  let latestInterim = '';
  let isStopped = false;
  let hasHeardSpeech = false;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;

  // Sound chime when mic listening opens
  playAudioCue('start');

  // 1. Acquire microphone stream with crystal clear audio constraints
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
      },
    });
  } catch (err: any) {
    const msg = err.name === 'NotAllowedError'
      ? 'Microphone permission denied. Please click the lock or mic icon in your address bar and allow microphone access.'
      : `Microphone error: ${err.message || 'Unable to access audio input device'}`;
    if (onError) onError(msg);
    throw new Error(msg);
  }

  // 2. Real-time Audio Meter & Voice Activity Detection (VAD) via Web Audio API
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      audioContext = new AudioCtx();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        if (isStopped || !analyser) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        // Normalize to 0 - 100 with boosted responsiveness
        const normalized = Math.min(Math.round((avg / 120) * 100), 100);
        if (onVolumeChange) onVolumeChange(normalized);

        // VAD: If voice volume exceeds threshold, mark that speech started
        if (normalized > 18) {
          hasHeardSpeech = true;
          // Reset silence timer because user is actively speaking
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
        } else if (hasHeardSpeech && autoStopOnSilence && !silenceTimer && !isStopped) {
          // User spoke previously and has now paused
          silenceTimer = setTimeout(() => {
            if (!isStopped && hasHeardSpeech) {
              if (onSilenceDetected) onSilenceDetected();
            }
          }, silenceThresholdMs);
        }

        animFrameId = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    }
  } catch (e) {
    console.warn('[speechRecognitionService] AudioContext volume meter not available:', e);
  }

  // 3. MediaRecorder Setup (captures Opus / WebM for Sarvam AI backend fallback)
  let mimeType = 'audio/webm';
  if (typeof MediaRecorder !== 'undefined') {
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/webm')) {
      mimeType = 'audio/webm';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
      mimeType = 'audio/ogg';
    }

    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };
      mediaRecorder.start(250); // collect in 250ms chunks
    } catch (e) {
      console.warn('[speechRecognitionService] MediaRecorder failed to start with mimeType:', mimeType, e);
    }
  }

  // 4. Native Speech Recognition Setup (Web Speech API)
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (SpeechRecognition) {
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = langCode;
      recognition.maxAlternatives = 2;

      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0]?.transcript || '';
          if (res.isFinal) {
            accumulatedFinal = accumulatedFinal ? `${accumulatedFinal} ${transcript}` : transcript;
          } else {
            interim += transcript;
          }
        }
        latestInterim = interim;
        const currentFull = (accumulatedFinal + (interim ? ` ${interim}` : '')).trim();
        if (currentFull) {
          hasHeardSpeech = true;
        }
        if (onInterimText) onInterimText(currentFull);

        // Reset silence timer on receiving new speech results
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[speechRecognitionService] Native SpeechRecognition event error:', event.error);
        if (event.error === 'not-allowed') {
          if (onError) onError('Microphone access blocked. Please enable microphone permission in browser settings.');
        } else if (event.error !== 'no-speech') {
          // ignore no-speech as user might pause
          if (onError) onError(`Speech notice: ${event.error}`);
        }
      };

      recognition.onend = () => {
        // If not stopped intentionally and recognition stopped unexpectedly, notify or restart
        if (!isStopped && onEnd) {
          onEnd();
        }
      };

      recognition.start();
    } catch (e) {
      console.warn('[speechRecognitionService] Native SpeechRecognition start failed:', e);
    }
  }

  // 5. Controller methods
  const cleanup = () => {
    isStopped = true;
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (onVolumeChange) onVolumeChange(0);
    if (audioContext && audioContext.state !== 'closed') {
      try {
        audioContext.close();
      } catch {}
      audioContext = null;
    }
    if (recognition) {
      try {
        recognition.stop();
      } catch {}
      recognition = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  };

  const stop = async (): Promise<{ transcript: string; audioBlob: Blob | null }> => {
    if (isStopped) {
      const finalRes = (accumulatedFinal || latestInterim).trim();
      return { transcript: finalRes, audioBlob: getRecordedBlob() };
    }

    // Stop tone cue
    playAudioCue('stop');

    // Stop recognition
    if (recognition) {
      try {
        recognition.stop();
      } catch {}
    }

    // Stop mediaRecorder and build blob
    let audioBlob: Blob | null = null;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        mediaRecorder!.onstop = () => resolve();
        try {
          mediaRecorder!.stop();
        } catch {
          resolve();
        }
      });
      if (audioChunks.length > 0) {
        audioBlob = new Blob(audioChunks, { type: mimeType });
      }
    }

    cleanup();

    const finalTranscript = (accumulatedFinal || latestInterim).trim();
    if (onFinalText && finalTranscript) {
      onFinalText(finalTranscript);
    }
    if (onEnd) {
      onEnd();
    }

    return {
      transcript: finalTranscript,
      audioBlob,
    };
  };

  const getRecordedBlob = (): Blob | null => {
    if (audioChunks.length > 0) {
      return new Blob(audioChunks, { type: mimeType });
    }
    return null;
  };

  const abort = () => {
    cleanup();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch {}
    }
  };

  return { stop, abort, getRecordedBlob };
}

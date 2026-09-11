---
name: multilingual-voice-triage
description: Integration patterns for multilingual voice receptionists using Sarvam AI (Saaras STT, Bulbul TTS), Web Audio API in React, audio chunk streaming, and strict intent validation (English, Hindi, Tamil, Telugu).
---

# Multilingual Voice Triage Patterns

Design patterns and integration recipes for AI receptionist voice interactions using Sarvam AI and OpenAI.

## When to Activate
- Capturing microphone audio via browser Web Audio API / MediaRecorder
- Streaming or batching audio to Sarvam AI STT (`Saaras` speech-to-text)
- Generating synthesized speech via Sarvam AI TTS (`Bulbul` text-to-speech)
- Validating multilingual extracted intents against `ai-services/intent-schema.json`
- Supporting Hindi (`hi-IN`), Tamil (`ta-IN`), Telugu (`te-IN`), and English (`en-IN`)

## 1. Clean Browser Audio Recording Hook

```tsx
import { useState, useRef, useCallback } from 'react';

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = useCallback(async () => {
    chunksRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Use standard audio/webm or audio/wav
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setAudioBlob(blob);
      stream.getTracks().forEach((track) => track.stop());
    };

    recorder.start(250); // Collect in 250ms chunks
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  return { isRecording, audioBlob, startRecording, stopRecording };
}
```

## 2. Intent Validation Gate ("AI Proposes, Backend Disposes")

Always validate LLM JSON outputs before dispatching to Supabase RPCs:

```ts
import intentSchema from '../../../ai-services/intent-schema.json';

export interface TriageIntent {
  intent: 'BOOK_APPOINTMENT' | 'CHECK_QUEUE_STATUS' | 'EMERGENCY_DISPATCH';
  language: 'hi-IN' | 'ta-IN' | 'te-IN' | 'en-IN';
  symptoms: string[];
  department?: string;
  urgency_level: 'ROUTINE' | 'URGENT' | 'CRITICAL_EMERGENCY';
  patient_name?: string;
  phone?: string;
}

export function validateIntent(rawJson: unknown): { valid: boolean; data?: TriageIntent; error?: string } {
  if (typeof rawJson !== 'object' || rawJson === null) {
    return { valid: false, error: 'Output is not a valid JSON object' };
  }
  const obj = rawJson as Record<string, any>;
  if (!obj.intent || !obj.urgency_level) {
    return { valid: false, error: 'Missing mandatory fields: intent or urgency_level' };
  }
  return { valid: true, data: obj as TriageIntent };
}
```

## 3. Supported Language Codes
- **Hindi**: `hi-IN`
- **Tamil**: `ta-IN`
- **Telugu**: `te-IN`
- **English (India)**: `en-IN`

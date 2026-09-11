---
name: sarvam-ai-integration
description: Sarvam AI API integration patterns for Saaras speech-to-text (STT), Bulbul text-to-speech (TTS), language auto-detection, audio encoding requirements, and error handling for multilingual healthcare voice workflows.
---

# Sarvam AI Integration Patterns

Reference patterns for integrating Sarvam AI's speech services into the MedConnect Pulse AI Receptionist pipeline.
- Official Documentation: `https://docs.sarvam.ai/api/getting-started/welcome`
- Authentication Headers: `api-subscription-key: <SARVAM_API_KEY>` or `Authorization: Bearer <SARVAM_API_KEY>`

## When to Activate
- Calling Sarvam AI `Saaras` STT API for speech-to-text transcription
- Calling Sarvam AI `Bulbul` TTS API for text-to-speech synthesis
- Handling multilingual audio (Hindi, Tamil, Telugu, English)
- Debugging audio format or encoding issues
- Building the n8n AI processing pipeline nodes

## 1. Saaras STT (Speech-to-Text)

### API Endpoint
```
POST https://api.sarvam.ai/speech-to-text
```

### Request Format
```json
{
  "model": "saaras:v2",
  "audio": "<base64_encoded_audio>",
  "language_code": "auto",
  "with_timestamps": false
}
```

### Headers
```
api-subscription-key: <SARVAM_API_KEY>
Authorization: Bearer <SARVAM_API_KEY>
Content-Type: application/json
```

### Audio Requirements
| Parameter | Requirement |
|:---|:---|
| Format | WAV, WEBM, MP3, OGG, FLAC |
| Sample Rate | 16kHz recommended (8kHz–48kHz accepted) |
| Channels | Mono preferred |
| Max Duration | 60 seconds per request |
| Encoding | Base64 string |

### Response
```json
{
  "transcript": "मुझे कल सुबह दस बजे कार्डियोलॉजी में अपॉइंटमेंट चाहिए",
  "language_code": "hi",
  "confidence": 0.94
}
```

### n8n HTTP Request Node Config
```json
{
  "method": "POST",
  "url": "https://api.sarvam.ai/speech-to-text",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "sendBody": true,
  "bodyParameters": {
    "model": "saaras:v2",
    "audio": "={{ $json.audio_base64 }}",
    "language_code": "auto"
  }
}
```

## 2. Bulbul TTS (Text-to-Speech)

### API Endpoint
```
POST https://api.sarvam.ai/text-to-speech
```

### Request
```json
{
  "model": "bulbul:v2",
  "text": "Your appointment is confirmed. Token number MED-4029.",
  "language_code": "en-IN",
  "speaker": "meera",
  "pitch": 0,
  "pace": 1.0,
  "loudness": 1.0
}
```

### Supported Voices
| Voice | Language | Gender |
|:---|:---|:---|
| `meera` | Hindi, English | Female |
| `arvind` | Hindi, English | Male |
| `amol` | Tamil, Telugu | Male |
| `pavithra` | Tamil, Telugu | Female |

### Response
Returns base64 audio in WAV format.

## 3. Language Code Mapping

| Language | Sarvam Code | Intent Schema Code |
|:---|:---|:---|
| English (India) | `en-IN` | `en` |
| Hindi | `hi-IN` | `hi` |
| Tamil | `ta-IN` | `ta` |
| Telugu | `te-IN` | `te` |

## 4. Error Handling

| HTTP Code | Meaning | Action |
|:---|:---|:---|
| 400 | Invalid audio format / too long | Check encoding, trim to 60s |
| 401 | Invalid API key | Verify `SARVAM_API_KEY` in n8n credentials |
| 429 | Rate limited | Back off 2s, retry max 3 times |
| 500 | Server error | Fall back to text-only input mode |

### Graceful Fallback Pattern
If STT fails, the frontend should offer a text input fallback:
```tsx
if (sttError) {
  setMode('text');
  showToast('Voice unavailable — please type your request');
}
```

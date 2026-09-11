---
name: hackathon-demo-hardening
description: Hackathon demo hardening patterns for offline fallbacks, demo data seeding, graceful API degradation, presentation-safe error handling, and zero-crash live demo guarantees.
---

# Hackathon Demo Hardening Patterns

Patterns to ensure MedConnect Pulse delivers a flawless, crash-proof demo regardless of network conditions or API availability.

## When to Activate
- Preparing for a live hackathon demo or presentation
- Building offline/fallback modes for API dependencies
- Seeding realistic demo data
- Adding presentation-safe error handling
- Stress-testing the full end-to-end flow before going on stage

## 1. Graceful Degradation Strategy

Every external dependency must have a fallback:

| Dependency | Primary | Fallback |
|:---|:---|:---|
| Supabase DB | Live Supabase instance | Local `demoStore` in `supabaseClient.js` |
| Sarvam AI STT | Live API call | Pre-recorded transcript JSON (`demo-transcripts.json`) |
| Sarvam AI TTS | Live API call | Pre-recorded audio files (`/public/demo-audio/`) |
| n8n Webhooks | Live n8n instance | Mock response with 500ms simulated delay |
| Telegram Bot | Live bot API | Console.log notification + UI toast |
| Twilio Voice | Live Twilio call | UI badge "Escalation Triggered" + audio beep |

### Implementation Pattern
```ts
async function callWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => T,
  label: string
): Promise<T> {
  try {
    const result = await Promise.race([
      primary(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      ),
    ]);
    return result;
  } catch (err) {
    console.warn(`[Demo Fallback] ${label} failed, using fallback:`, err);
    return fallback();
  }
}
```

## 2. Demo Data Seeding Checklist

Before the demo, verify these exist in the database (or `demoStore`):

- [ ] **5 hospitals** with realistic Bangalore coordinates
- [ ] **4 departments** per hospital (General Medicine, Cardiology, Orthopedics, Pediatrics)
- [ ] **20+ available slots** spread across the next 3 days
- [ ] **3 pre-booked appointments** to show queue movement
- [ ] **1 active emergency request** in `BROADCASTED` status with timer ticking
- [ ] **2 doctors per department** with names and specializations

### Quick Seed Command
```bash
# From project root
node scripts/seed-demo-data.js
# Or via Supabase SQL editor
psql < backend/seed/seed_data.sql
```

## 3. Presentation-Safe Error Boundaries

Wrap every major feature section in a React Error Boundary:

```tsx
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; fallbackLabel: string; }
interface State { hasError: boolean; }

class DemoErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.fallbackLabel}]`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-yellow-50 border border-yellow-300 rounded-xl text-center">
          <p className="text-yellow-800 font-medium">
            ⚠️ {this.props.fallbackLabel} is loading...
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Usage:
```tsx
<DemoErrorBoundary fallbackLabel="Voice Booking Widget">
  <VoiceBookingWidget />
</DemoErrorBoundary>
```

## 4. Pre-Demo Verification Script

Run this checklist before going on stage:

```bash
# 1. Frontend builds cleanly
cd frontend && npm run build

# 2. Concurrency tests pass
cd .. && node scripts/test-concurrency.js

# 3. Demo data is seeded
node scripts/healthcheck.js

# 4. All environment variables are set
node -e "const fs=require('fs'); const env=fs.readFileSync('.env','utf8'); const missing=['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY'].filter(k=>!env.includes(k+'=')); if(missing.length) { console.error('Missing:', missing); process.exit(1); } else { console.log('All env vars present'); }"
```

## 5. Live Demo Flow Script (Suggested Order)

1. **Open Patient Portal** → Show multilingual language selector
2. **Record voice input** (Hindi) → Show real-time transcription
3. **AI extracts intent** → Display structured JSON
4. **Atomic booking** → Show QR token with animation
5. **Switch to Queue view** → Show live position updates
6. **Switch to Emergency tab** → Trigger SOS
7. **Show Radar Map** → Hospitals light up within radius
8. **Hospital accepts** → Show resource lock animation
9. **Show QR Emergency Pass** → Scan verification
10. **Trigger escalation timer** → Show 120s countdown + Twilio trigger

**Total estimated demo time: 4-5 minutes**

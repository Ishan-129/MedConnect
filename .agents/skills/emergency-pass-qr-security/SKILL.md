---
name: emergency-pass-qr-security
description: Security patterns for digital emergency passes, anti-tampering QR tokens, camera scanner integration (HTML5-QRCode), timestamp verification, and single-use claim validation.
---

# Emergency Pass & QR Security Patterns

Implementation patterns for generating, rendering, scanning, and cryptographically validating digital emergency passes and queue tokens.

## When to Activate
- Generating dynamic QR tokens (`qrcode.react` or SVG) for patients and ambulances
- Scanning QR codes with hospital webcam / mobile camera (`html5-qrcode`)
- Preventing double-scanning or replay attacks
- Verifying QR payload signatures server-side

## 1. QR Token Structure & Payload

Never put raw sensitive PHI inside the unencrypted QR payload. Only include the minimal claim token + timestamp:

```json
{
  "pass_id": "DISPATCH-PASS-unbztr8y",
  "request_id": "emg-001",
  "issued_at": 1724601600,
  "expires_at": 1724608800,
  "type": "EMERGENCY_DISPATCH_PASS"
}
```

## 2. Dynamic QR Generator Component (React)

```tsx
import QRCode from 'qrcode.react';

interface EmergencyPassQRProps {
  passId: string;
  requestId: string;
  expiresAt: number;
}

export function EmergencyPassQR({ passId, requestId, expiresAt }: EmergencyPassQRProps) {
  const payload = JSON.stringify({
    pass_id: passId,
    request_id: requestId,
    expires_at: expiresAt,
    type: 'EMERGENCY_DISPATCH_PASS',
  });

  return (
    <div className="flex flex-col items-center p-4 bg-white rounded-xl shadow-lg border-2 border-red-500">
      <QRCode
        value={payload}
        size={220}
        level="H" // High error correction for fast camera scan
        includeMargin={true}
      />
      <div className="mt-3 text-center">
        <span className="font-mono text-sm font-bold text-gray-800">{passId}</span>
        <p className="text-xs text-red-600 font-semibold mt-1">EMERGENCY PRIORITY ADMISSION</p>
      </div>
    </div>
  );
}
```

## 3. Atomic Server-Side Verification (PostgreSQL)

When a hospital triage desk scans the pass, execute an atomic SQL function to verify and mark as redeemed:

```sql
CREATE OR REPLACE FUNCTION verify_and_redeem_pass(
  p_pass_id TEXT,
  p_hospital_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_request RECORD;
BEGIN
  -- Lock row to prevent concurrent double-redemption
  SELECT * INTO v_request
  FROM emergency_requests
  WHERE qr_pass_id = p_pass_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PASS');
  END IF;

  IF v_request.status = 'COMPLETED' OR v_request.pass_redeemed = TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'PASS_ALREADY_REDEEMED');
  END IF;

  IF v_request.responding_hospital_id != p_hospital_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'WRONG_HOSPITAL_FACILITY');
  END IF;

  UPDATE emergency_requests
  SET pass_redeemed = TRUE,
      redeemed_at = NOW(),
      status = 'PATIENT_ADMITTED'
  WHERE id = v_request.id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request.id,
    'patient_name', v_request.patient_name,
    'urgency', v_request.urgency_level
  );
END;
$$;
```

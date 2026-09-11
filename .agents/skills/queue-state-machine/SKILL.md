---
name: queue-state-machine
description: Appointment lifecycle state machine patterns for queue position management, status transitions (booked → checked_in → in_consultation → completed), PostgreSQL trigger-based recalculation, and reactive UI sync.
---

# Queue State Machine Patterns

Strict state machine definitions and implementation patterns for the MedConnect Pulse live queue engine.

## When to Activate
- Implementing appointment status transitions
- Building queue position recalculation logic (SQL triggers or RPCs)
- Wiring `LiveQueueTracker.jsx` with Supabase Realtime
- Designing the n8n queue-engine workflow
- Debugging incorrect queue positions or stale UI state

## 1. Appointment State Machine

```text
                    ┌──────────────┐
                    │   BOOKED     │ ← Initial state after atomic slot lock
                    └──────┬───────┘
                           │ Patient scans QR / manual check-in
                    ┌──────▼───────┐
                    │  CHECKED_IN  │ ← Patient is in waiting room
                    └──────┬───────┘
                           │ Doctor calls patient
                    ┌──────▼───────┐
                    │IN_CONSULTATION│ ← Active consultation
                    └──────┬───────┘
                           │ Consultation ends
                    ┌──────▼───────┐
                    │  COMPLETED   │ ← Terminal state
                    └──────────────┘

  At any point before COMPLETED:
                    ┌──────────────┐
                    │  CANCELLED   │ ← Terminal state (patient/admin cancel)
                    └──────────────┘
```

### Valid Transitions Table

| From | To | Trigger |
|:---|:---|:---|
| `booked` | `checked_in` | QR scan at reception desk |
| `booked` | `cancelled` | Patient cancels or no-show timeout |
| `checked_in` | `in_consultation` | Doctor calls next patient |
| `checked_in` | `cancelled` | Patient leaves before being seen |
| `in_consultation` | `completed` | Doctor ends consultation |

### Invalid Transitions (must be rejected)
- `completed` → anything
- `cancelled` → anything
- `in_consultation` → `booked` (no going backwards)

## 2. Queue Position Recalculation (PostgreSQL)

Queue position = count of appointments with `status IN ('checked_in')` AND `check_in_time < this_appointment.check_in_time` within the same department, plus 1.

```sql
CREATE OR REPLACE FUNCTION recalculate_queue_positions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Recalculate positions for all checked-in patients in the same department
  WITH ranked AS (
    SELECT
      a.id,
      ROW_NUMBER() OVER (
        ORDER BY a.check_in_time ASC
      ) AS new_position
    FROM appointments a
    JOIN slots s ON a.slot_id = s.id
    WHERE s.department_id = (
      SELECT s2.department_id FROM slots s2 WHERE s2.id = COALESCE(NEW.slot_id, OLD.slot_id)
    )
    AND a.status = 'checked_in'
  )
  UPDATE appointments
  SET queue_position = ranked.new_position
  FROM ranked
  WHERE appointments.id = ranked.id
    AND appointments.queue_position IS DISTINCT FROM ranked.new_position;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach trigger to appointments table
CREATE TRIGGER trg_recalculate_queue
AFTER INSERT OR UPDATE OF status ON appointments
FOR EACH ROW
EXECUTE FUNCTION recalculate_queue_positions();
```

## 3. Estimated Wait Time Formula

```ts
function estimateWaitMinutes(
  queuePosition: number,
  avgConsultationMinutes: number = 15
): number {
  return Math.max(0, (queuePosition - 1) * avgConsultationMinutes);
}
```

Display in UI:
- Position 1 → "You're next!"
- Position 2-3 → "Estimated wait: ~15-30 min"
- Position 4+ → "Estimated wait: ~45+ min"

## 4. React UI State Sync

```tsx
// Map DB status to user-friendly display
const STATUS_DISPLAY: Record<string, { label: string; color: string; icon: string }> = {
  booked:           { label: 'Appointment Confirmed', color: 'blue',   icon: '📋' },
  checked_in:       { label: 'In Queue — Waiting',    color: 'yellow', icon: '⏳' },
  in_consultation:  { label: 'With Doctor Now',       color: 'green',  icon: '🩺' },
  completed:        { label: 'Visit Complete',        color: 'gray',   icon: '✅' },
  cancelled:        { label: 'Cancelled',             color: 'red',    icon: '❌' },
};
```

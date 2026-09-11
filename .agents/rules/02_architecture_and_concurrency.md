# Rule 02: Architecture & Concurrency Guarantees

1. **Supabase is the Single Source of Truth**:
   - Application state must reflect PostgreSQL state.
   - Queue positions and appointment statuses must be queryable directly from Supabase.

2. **Atomic Slot Reservation & Double-Booking Prevention**:
   - Every appointment booking must execute through `book_appointment_atomic()`.
   - The function must acquire a row-level lock (`SELECT ... FOR UPDATE`) on the target slot.
   - If two requests arrive at the exact same millisecond for the same slot, exactly ONE succeeds with HTTP 200, and the other fails with a clean `SLOT_UNAVAILABLE` exception.

3. **Atomic Emergency Resource Claiming**:
   - Hospital resource acceptance must execute through `accept_emergency_request()`.
   - Uses a conditional `UPDATE emergency_requests SET status = 'RESOURCE_LOCKED' WHERE id = p_request_id AND status IN ('SEARCHING', 'BROADCASTED')`.
   - If multiple hospitals click "Accept" simultaneously, only the fastest gets the lock; others receive `ALREADY_CLAIMED`.

4. **"AI Proposes, Backend Disposes"**:
   - AI outputs from OpenAI / Sarvam must be validated against `ai-services/intent-schema.json` via a server/code node validator before any DB write.

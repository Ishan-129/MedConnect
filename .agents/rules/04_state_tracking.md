# Rule 04: Live State Tracking & Task Handover

1. **Check State Before Working**:
   - Every AI agent and developer MUST check `docs/PROJECT-STATE.md` at the start of a session to understand what has been completed and what is next.

2. **Update State After Completing a Task**:
   - When a phase task is implemented and verified, update `docs/PROJECT-STATE.md` with:
     - Status changed from `⏳ Ready to Execute` / `⚪ Pending` to `✅ Done`.
     - Timestamp and brief verification note.

3. **Audit Log Maintenance**:
   - Update `docs/AUDIT-LOG.md` with any new test runs, security reviews, or metric changes.

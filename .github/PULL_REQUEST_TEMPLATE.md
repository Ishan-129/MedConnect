## What

<!-- One or two sentences: what does this PR do? -->

## Why

<!-- What problem/feature does this address? Link an issue/card if there is one. -->

## How

<!-- Key implementation details worth a reviewer knowing. Skip if trivial. -->

## Testing

- [ ] Happy path tested manually
- [ ] Failure/edge case tested (list which below)
- [ ] Concurrency case tested, if this touches booking or accept-and-lock logic (fire two simultaneous requests, confirm exactly one succeeds)

<!-- List edge cases tested: -->

## Touches shared contracts?

- [ ] DB schema / migration
- [ ] n8n webhook shape or payload
- [ ] `ai-services/intent-schema.json`
- [ ] QR token/pass payload or validation
- [ ] None of the above

If any box above is checked, tag the owning dev(s) of the other affected modules for review, not just your CODEOWNERS reviewer.

## Checklist

- [ ] No secrets, API keys, or credentials committed (checked `.env`, n8n exports, frontend bundle)
- [ ] No unrelated files changed
- [ ] Existing demo flows (Journey 1 and/or Journey 2) still work end-to-end
- [ ] Server-side validation is in place for any new AI-extracted or QR-scanned input — the frontend/AI does not write directly to the DB unchecked
- [ ] Branch is rebased on latest `main`
- [ ] CI is green

## Screenshots (if UI change)

<!-- Before/after, or a short clip -->

Closes #

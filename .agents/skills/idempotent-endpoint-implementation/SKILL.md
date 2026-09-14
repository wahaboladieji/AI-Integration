---
name: idempotent-endpoint-implementation
description: How to make an endpoint idempotent so a duplicate request or a duplicate webhook event never repeats a side effect. Use this whenever you're building the signup endpoint, any checkout/payment initiation endpoint, or any webhook handler — the PRD requires signup to produce exactly one account on double submission, and requires webhook processing to be keyed on the provider reference so a replayed event is recorded once and acted on once. Trigger this even if the word "idempotent" isn't used, any time you're writing an endpoint that creates a resource or grants an entitlement from an external event.
---

# Idempotent Endpoint Implementation

`database-schema.md` gives you the constraint (a unique index). `security.md` tells you idempotency is required. Neither walks through the actual check-then-act sequence — that's this skill. Signup and webhook handling look different on the surface but are the same shape: detect that this exact request/event has already been handled, and if so, return the same result without repeating the side effect.

## When to use this

- Signup endpoint (Assessment 1) — a double submission must create exactly one account.
- Checkout initiation and webhook handlers (Assessment 2) — a repeated webhook must be recorded once and acted on once, keyed on the provider's event reference.
- Any other endpoint that creates a database row or grants access as a direct result of an external call.

## The procedure

1. **Pick the natural idempotency key before writing any logic.** For signup, that's the email address (already unique at the database level per `database-schema.md`). For a webhook, that's the provider's event/reference ID, never a value you generate yourself.

2. **Enforce the key at the database level, not just in application logic.** A unique constraint or unique index is the last line of defence — see `database-schema.md`. Application-level "check if it exists, then insert" has a race condition; the database constraint is what actually prevents the duplicate under concurrent requests.

3. **Write the sequence as: attempt insert → catch the unique-constraint violation → look up and return the existing record.** Do not do "check first, then insert" as your only guard — two nearly-simultaneous requests can both pass the check before either inserts. The database constraint plus a catch-and-fetch is the reliable pattern.

4. **For webhooks specifically, log the event to the payment log table (`database-schema.md`, append-only) before or as part of processing it**, keyed on the provider reference, so a replay is detected by that log, not by re-deriving state from the subscription table.

5. **Return the same response for a duplicate as for the original success.** The caller (browser or payment provider) should not be able to tell the difference between "created for the first time" and "already existed" from the response shape — only from a flag you choose to include if useful for debugging.

6. **Never grant the effect twice.** If the second (duplicate) request arrives, do not re-run the entitlement grant, the welcome email, or any other side effect a second time, even if the record lookup succeeds.

7. **Prove it.** For signup: fire the same request twice in the same second and show the database has one row (Assessment 1's defence question asks this directly). For webhooks: fire the same event twice and show the second is recorded and ignored (Assessment 2's required evidence).

## What this is not

This is not about validating input (`security.md` covers schema validation separately) and not about rate limiting (see `rate-limiting-implementation`) — a request can be within the rate limit and still need idempotency protection, because idempotency guards against legitimate retries and replays, not abuse volume.
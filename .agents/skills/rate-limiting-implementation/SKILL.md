---
name: rate-limiting-implementation
description: How to add rate limiting to an endpoint consistently across this project. Use this any time you are writing or touching signin, signup, password reset request, verification code resend, checkout initiation, the AI processing trigger endpoint, or the AI follow-up action endpoint — security.md requires every one of these to be rate limited, and this skill is what makes them behave the same way. Trigger this whenever you're about to write a route handler for an endpoint that is expensive, abusable, or state-changing, even if the word "rate limit" doesn't appear in the request.
---

# Rate Limiting Implementation

`security.md` states which endpoints must be rate limited. It does not say how to key, store, or respond with a limit — that consistency is this skill's job. Every endpoint you rate limit in this project must follow the same shape, or a reviewer (and a future route) will find the one you did differently.

## When to use this

Any endpoint in the "must be rate limited" list from `security.md`:
- signin, signup, password reset request, verification code resend (Assessment 1)
- checkout initiation (Assessment 2)
- AI processing trigger, AI follow-up action (Assessment 3)

Do not skip the resend endpoint. It is named explicitly in the PRD's traps as the one that costs real money and gets forgotten.

## The procedure

1. **Choose the key.** Rate limit by authenticated user ID when the user is signed in (checkout initiation, AI trigger, follow-up action). Rate limit by a combination of IP and the submitted identifier (e.g. IP + email) when there is no session yet (signin, signup, password reset request). Never key on IP alone for an authenticated endpoint — that punishes shared networks and under-punishes a single attacker who rotates identities behind one IP.

2. **Centralize the limiter.** Implement one shared rate limiter (`/server/rate-limit/rate-limiter.ts` per the AGENTS.md folder layout) that every route imports. Do not write a bespoke limiter per route — that's how the resend endpoint ends up unprotected while signin is protected.

3. **Read limits from config, not the handler.** The actual numbers (requests per window, window length) live in the single config file `ai-pipeline.md`/AGENTS.md describe for AI endpoints, or an equivalent auth/payments config section for the others. Never hardcode `5` or `60` inside the route file.

4. **Define window and threshold per endpoint deliberately**, and write a one-line comment on each explaining why that number (per `coding-standards.md`'s rule on non-obvious constants). A password reset request endpoint and an AI trigger endpoint do not need the same threshold.

5. **Return the correct signal when the limit is hit.** Respond with `429 Too Many Requests` and a `Retry-After` header (or equivalent retry indication). A plain generic error is not sufficient — the PRD's grading bands explicitly call out "a correct status code with a retry indication" as the bar for excellence.

6. **Fail closed, not open.** If the rate limiter's backing store is unreachable, do not silently let the request through. Decide and document the fallback behavior explicitly rather than defaulting to "allow."

7. **Test it by actually triggering it.** Do not assume the limiter works — call the endpoint past its threshold and confirm the `429` and status code. This is required evidence for Assessment 1 ("Evidence of the rate limit triggering, showing the status code returned").

## What this is not

This skill does not cover idempotency (a duplicate request that arrives within the limit but shouldn't create a second resource) — see `idempotent-endpoint-implementation` for that. Rate limiting stops volume; idempotency stops duplication. An endpoint often needs both.
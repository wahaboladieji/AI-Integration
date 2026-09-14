---
trigger: always_on
---

# Security Rules

## Authentication
- Passwords are hashed with an adaptive algorithm (bcrypt or Argon2). Never a general-purpose hash (SHA-256, MD5) for passwords, ever.
- The hashing cost factor is deliberately set and documented; it is never lowered "for speed" in any environment that touches real credentials.
- Session cookies are `httpOnly`, `secure`, and `sameSite` appropriately set, with an explicit expiry. No session token readable from client-side JavaScript.
- Email verification codes and password reset tokens expire in the database, are single-use, and are invalidated immediately on use — not just hidden in the UI after use.

## Authorization
- Every database query for user-owned data is scoped to the authenticated user *in the query itself* (`WHERE userId = ...`), never filtered after the fetch.
- `401` is used only for "not authenticated." `403` is used only for "authenticated but not allowed." They are never used interchangeably.
- No raw database identifiers are exposed in URLs or the interface. Use opaque, non-sequential public identifiers instead.
- Access control is tested with at least two user accounts, attempting to reach one user's data as the other, including by directly editing identifiers and calling endpoints outside the UI.

## Input Handling
- All external input (form submissions, API payloads, file uploads) is validated server-side against a declared schema, regardless of what client-side validation exists. Client-side validation is for UX only, never trusted as the real check.
- Endpoints that create records from user input (signup, checkout, upload) are idempotent — a duplicate request never creates a duplicate resource.

## Payments & Money
- No card data (number, CVV, expiry) is ever stored anywhere in the system, in any table, in any log. Use the payment provider's hosted fields or tokenization.
- Webhook payloads are verified by signature before any processing occurs. An unverified payload is rejected outright, not processed "cautiously."
- Entitlement (access to a paid feature) is granted only after server-side verification of payment — never on the strength of a frontend redirect or client claim alone.

## Secrets & Rate Limiting
- API keys and credentials are written into `.env` by hand by a human, never generated or written by an agent. They are never logged, never returned in an API response, never included in error messages.
- Every endpoint that is expensive, state-changing, or abusable (signin, signup, password reset, resend, checkout initiation, AI processing trigger, follow-up actions) is rate limited.

## Violations
Any item in this file being broken is a failed task even when the demo works — the entire point of these rules is that the failure is invisible until someone exploits it.
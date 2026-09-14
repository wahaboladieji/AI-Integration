---
trigger: always_on
---

# Git Conventions

## Secrets
- `.env` is never committed, at any point, in any commit — including one that's later "removed," since it still lives in history. `.gitignore` must include `.env` from the very first commit.
- If a secret is ever committed, it is treated as compromised: rotate the credential immediately and scrub it from history. Do not just delete it in a later commit and consider it handled.
- `.env.example` is the only env file that is committed, and it contains commented placeholders only, never real values.

## Commit History
- Work is committed incrementally as it's built. No single end-of-task commit containing the entire feature.
- Each commit represents one coherent change (one endpoint, one migration, one fix) — not an unrelated grab-bag.
- Migration files are committed in the same commit as the code that depends on them, never separately or out of order.

## Commit Messages
- Use a conventional prefix: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`. Message body is imperative ("add rate limit to signup route", not "added" or "adding").
- Where relevant, reference which requirement or assessment section the commit addresses.

## Branching
- Non-trivial work happens on a feature branch, not directly on `main`. Trivial doc fixes are the only exception.

## Ignored Files
- `.gitignore` is set up before the first commit and excludes build output, dependency folders, and local env files. Verify this before committing, not after something leaks.

## Violations
A committed secret or a single opaque commit covering the whole task is a failed task regardless of whether the code works — there is no way to verify the work was done as described.
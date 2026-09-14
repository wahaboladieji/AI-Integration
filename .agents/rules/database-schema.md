---
trigger: glob
---

# Database Schema Rules

## Schema Changes
- All schema changes go through Prisma migrations. No manual `ALTER TABLE` against a running database, ever, including "just to fix something quickly."
- Every migration is committed with a descriptive name and lands in the same commit/PR as the code that requires it.

## Money
- Every monetary amount is stored as a whole number in the smallest currency unit (e.g. cents), typed as an integer. Never `Decimal`, never `Float`, never a string, for money. Anywhere. Ever.
- Currency is stored alongside the amount on the same row, never assumed.
- Payment/transaction event tables are append-only. Rows are never updated or deleted after being written. A correction is a new row, not an edit.

## Integrity Constraints
- `email` has a unique constraint enforced at the database level, not only checked in application code.
- Every user-owned table has a foreign key to the owning user, with an explicit `onDelete` strategy — never left at the Prisma default without a comment explaining the choice.
- Verification codes and password reset tokens have an `expiresAt` column, and every query that reads them filters on it. Expiry that only exists as a countdown in the UI does not count.
- Reset tokens and verification codes are single-use: once consumed, they are invalidated at the database level (deleted or flagged), not just ignored by the frontend.
- Status fields (job status, subscription status, etc.) use a Prisma enum, not a free-text string.

## Auditability
- Every deletion of a user-owned record writes an audit row (who, what, when) in the same transaction as the delete, before or as part of it — never logged after the row is already gone.
- Uploaded files are never stored as file content in any table. Only the storage key/reference is stored.
- Every "unit of work" that runs asynchronously (a background job, an AI processing task) has its own row with status, attempt count, and error message on failure.

## Performance
- Every column used in a `WHERE`, `ORDER BY`, or join for a main user-facing query has an index, and that index is documented in `DOCUMENTATION.md` alongside a before/after query count where relevant.

## Conventions
- All tables have `createdAt` and `updatedAt` timestamps.
- Table and column names are consistent (Prisma's default camelCase-in-code / snake_case-in-db mapping is used as-is, not overridden per table).

## Violations
A schema that "works" but stores money as a float, allows duplicate emails, or lets a payment log be edited is a failed task — the code running is not the bar.
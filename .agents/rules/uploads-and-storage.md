---
trigger: always_on
---

# Uploads and Storage Rules

## Where Files Live
- Uploaded files are never stored as content inside Postgres, or any relational database, under any circumstance. Only the storage key/reference is stored in the database.
- Files live in object storage, or a documented local development equivalent that behaves the same way. If using a local equivalent, the difference from production storage is documented in `DOCUMENTATION.md`.

## Validation
- File type and size restrictions are enforced server-side. Client-side restrictions are UX only and are never trusted as the actual check.
- An upload of an empty file, a corrupted file, and a file exactly at the size limit are each tested explicitly before the feature is considered done. Testing only with clean, well-formed files is not sufficient.

## Access Control
- Storage keys are opaque and non-sequential — never a predictable pattern (incrementing ID, filename as given by the user, etc.).
- Access to a stored file is gated by an ownership check against the authenticated user, not by the obscurity of the storage key. A leaked or guessed key must not be enough to read the file.

## Processing
- An upload creates a job/record row before any processing begins. The upload request itself never blocks waiting for processing to complete.
- If an upload fails validation or processing, the failure is recorded on that row and shown honestly — never a silently stuck "processing" state.

## Cleanup
- A file is never deleted without its corresponding database record being updated or removed in the same operation. No orphaned files with no record, and no records pointing at files that no longer exist.

## Violations
Storing a file inline in the database, or making a file accessible without an ownership check, is a failed task even if the upload "works" in a demo.
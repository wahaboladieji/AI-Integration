---
name: background-job-and-queue-implementation
description: How to build the job record, worker, and concurrency cap that back any asynchronous processing in this project — most directly the AI upload-and-process flow in the PRD's Assessment 3. Use this whenever you are making an endpoint hand off work to run later instead of blocking the request, whenever you need a job status (pending/processing/done/failed) to be real and database-backed, or whenever you need to stop many simultaneous uploads from firing many simultaneous provider calls. Trigger this before writing the upload route, the worker, or the queue/concurrency cap — not after.
---

# Background Job & Queue Implementation

`ai-pipeline.md` and AGENTS.md both require jobs to exist, to have their own status/attempts/error fields, and to be bounded by a concurrency cap that actually holds. Neither document is a build order — this skill is. Skipping the order here is exactly how you end up with a request that blocks on the model call, or a concurrency cap that exists in code but was never actually exercised (a named trap in the PRD).

## When to use this

Any flow where an endpoint must return immediately while real work continues after — in this project, that is the AI upload-and-process flow (Assessment 3), and its follow-up action.

## The procedure

1. **Create the job row first, before touching the model.** The upload/trigger route's only responsibilities are: validate the request, write the file to storage (see `uploads-and-storage.md`), create a job record with status `pending`, and return. It must not call the AI model inline — see AGENTS.md's rule that the upload request never blocks on the model call.

2. **Design the job row with the required fields**, per `database-schema.md`: status (enum: pending/processing/done/failed), attempt count, error message (nullable, populated only on failure), and a foreign key to the storage key, never to the file itself.

3. **Build the queue/concurrency cap as a real gate, not a comment.** Decide the concurrency limit up front (from the single config file per `ai-pipeline.md`), and implement a worker loop or semaphore that actually refuses to start a new provider call beyond that limit — queued jobs wait, they don't fire anyway.

4. **The worker, not the route, transitions status.** `pending → processing` happens when the worker picks the job up. `processing → done` or `processing → failed` happens when the model call resolves or fails. The interface only ever reflects what's in this row — never a client-side assumption of progress.

5. **Wrap every model call with a timeout and a defined fallback**, per `ai-pipeline.md`. On timeout, transition the job to `failed` with a clear error message — do not leave it stuck in `processing` forever.

6. **On failure, write the real error message to the row, not a generic string.** This is required evidence: a screenshot of the jobs table showing one successful and one failed run, with the failure's error message visible.

7. **Prove the cap holds.** Upload enough files at once to exceed the concurrency cap and show the actual pattern of provider calls stayed bounded — this is required evidence, not just an assertion. Do this deliberately as a test, don't wait to discover it by accident.

## What this is not

This skill covers the job/queue infrastructure — how work gets scheduled and tracked. It does not cover what happens to the model's *response* once the call returns; that's `structured-output-validation-and-retry`. Use both together: this skill gets the call made safely, the other skill makes sure what comes back is trustworthy.
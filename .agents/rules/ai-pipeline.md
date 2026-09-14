---
trigger: glob
---

# AI Pipeline Rules

## Provider & Configuration
- Official SDKs only for any AI provider call. If no official SDK exists for the platform, use a compatible official SDK pointed at the provider's endpoint, and document why.
- Every configurable value — model identifier, timeout, output token cap, temperature, rate limit, concurrency cap — lives in exactly one configuration file. None of these values are hardcoded in a route handler, a worker, or business logic.
- API keys are written into `.env` by hand by a human, never generated or inserted by an agent.

## Roles & Prompts
- At least two distinct AI roles are implemented, either as two different models or one model with two clearly separate, clearly named system prompts. A single blended "do everything" prompt does not satisfy this.
- Each system prompt is written out and version-controlled. Each parameter set for a call (temperature, token cap, etc.) is justified with a one-line reason.

## Structured Output
- Model output is requested using a defined schema. The response is validated in application code on receipt — the provider's schema enforcement alone is not treated as sufficient.
- A failed validation triggers a defined retry, and a defined graceful failure if the retry also fails. "Graceful" means the user sees an honest, designed failure state, not a raw error string.
- Never parse free-text model output with string operations (regex, manual splitting) as a substitute for structured output.

## Jobs & Concurrency
- Every unit of work (one file, one processing request) gets its own job record: status, attempt count, and error message on failure.
- Upload/trigger requests never block on the model call. Processing happens in a background job.
- A queue or concurrency cap limits how many simultaneous provider calls can be in flight. This cap must actually hold under load and be demonstrable, not just present in code and untested.
- Every model call has a timeout and a defined fallback behavior for when it fires. No call is allowed to hang indefinitely.

## Truthfulness
- The interface state always reflects the actual job record in the database. A "processing" or "done" state shown to the user must be backed by a real row with that status — never UI theatre with no backing data.
- Raw model output is retained alongside the validated/parsed result for debugging and audit purposes.

## Cost
- An approximate cost per run is calculated and documented, along with what caps the total possible spend (rate limits, concurrency limits).

## Violations
A pipeline that returns a plausible-looking wrong answer as a "success," or has no real concurrency cap, is a failed task even if the demo runs cleanly — these are the failures that stay invisible until they're expensive.
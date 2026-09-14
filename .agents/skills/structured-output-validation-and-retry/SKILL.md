---
name: structured-output-validation-and-retry
description: How to request structured output from an AI model, validate it in your own application code, and handle a validation failure with a defined retry and a defined graceful failure. Use this whenever you are writing a call to an AI model that is expected to return structured data (not free text) — both AI roles in Assessment 3, and the follow-up action. Trigger this before writing any model-calling code, and especially if you're tempted to parse the model's text response with string operations, regex, or manual splitting — that is the exact trap this skill exists to prevent.
---

# Structured Output Validation & Retry

`ai-pipeline.md` requires structured output, validated in your own code, with a defined retry and a defined graceful failure. It does not walk through the sequence. This skill does. The failure mode this guards against is worse than a crash: a model returning something plausible-looking but wrong, displayed to the user as a success. `security.md`'s and AGENTS.md's shared principle — the interface must never claim a state the database doesn't back — applies here to correctness, not just status.

## When to use this

Every call to an AI model in this project that is expected to return structured data: both of the two required AI roles in Assessment 3, and the one follow-up action (summarise/rephrase/expand).

## The procedure

1. **Define the schema before writing the prompt.** Decide the exact shape of the output you need (field names, types, required vs optional) and write it as a real schema your code can check against — not a description in the prompt alone.

2. **Request structured output using the provider's schema/tool-calling mechanism**, not by asking nicely in the prompt for "JSON only." Use the official SDK's structured-output feature per `ai-pipeline.md`'s locked choice on official SDKs.

3. **Never parse the raw text response with string operations.** No regex extraction, no `.split()`, no manual scanning for a JSON blob inside prose. If you find yourself doing this, stop — this is the named trap in the PRD ("parsing prose with string operations instead of requesting structured output").

4. **Validate what comes back in your own code, on receipt**, even though the provider also enforces its schema. Do not treat provider-side enforcement as sufficient — the grading bar for "excellent" explicitly requires your own validation layer.

5. **On validation failure, retry once with an adjusted prompt or parameters** (e.g. a stricter reminder of the schema, or a lower temperature) — define exactly what changes on retry, don't just resend the identical request and hope.

6. **If the retry also fails, transition the job to a graceful failure**, not a raw error. "Graceful" means the job's `failed` status carries a clear, honest error message, and the user sees a designed failure state — never a stack trace, never a silently stuck spinner.

7. **Keep the raw model output alongside the validated, parsed result.** This is required evidence for Assessment 3 — the raw output next to the validated result, and the specific behavior when you deliberately break the schema or the response on purpose to test the failure path.

## What this is not

This skill governs the model's response contract. It does not cover job scheduling, concurrency, or the worker loop that invokes the model call — see `background-job-and-queue-implementation` for that. The two are used together: one gets the call made safely and on schedule, this one makes sure what comes back can be trusted before it reaches the user.
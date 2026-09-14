# AGENTS.md

## 1. What This Project Is

This project is the **AI Integration Slice** — a single working flow where a user uploads a file, a background job sends it through an AI model, and a structured result comes back and is shown to the user.

It is not a full application. It is one flow, built properly, with nothing else around it.

- **Who it is for:** a reviewer grading whether this one flow is engineered correctly, not a real end user of a finished product.
- **Version being built:** v1, and the only version. There is no "phase 2" to prepare for. Do not build toward a future version.
- **Source of truth:** the PRD (Assessment 3: The AI Integration Slice) is the only source of truth for WHAT to build — the domain, the screens, the behaviour, the grading bands. This AGENTS.md is the only source of truth for HOW to build it. If the two ever appear to conflict on a "how" question, this file wins. If they conflict on a "what" question, the PRD wins. Neither document overrides the locked stack below.

You, the agent, do not choose the domain, the framework, the database, or the AI provider's SDK style. Those are either fixed by the PRD or locked in Section 2 of this file.

---

## 2. What Is Locked

The following are decided. Do not change them, swap them, "improve" them, or suggest alternatives mid-task. If you believe one of these is wrong, stop and ask — do not silently work around it.

- **Framework:** Next.js. No other framework. No parallel Express server, no separate backend service, no separate frontend framework bolted on.
- **Language:** TypeScript. No `.js` files in application source. No `any` used to avoid typing something properly.
- **ORM:** Prisma. No raw SQL migrations, no second ORM, no query builder added alongside it.
- **Database:** PostgreSQL. No SQLite for "just getting started," no swapping in a different database because it seemed easier for background jobs.
- **AI SDKs:** official SDKs only, for whichever provider(s) I choose to serve the two AI roles. do not write a hand-rolled HTTP client to avoid using an SDK.
- **File storage:** object storage, or a documented local development equivalent that behaves the same way (files never live in Postgres). This mechanism, once chosen, does not change mid-build.
- **Secrets:** `.env` for local secrets, `.env.example` with commented placeholders committed to the repo. No secrets manager, no hardcoded keys, no committing `.env`.

Nothing in this list is a suggestion. Swapping any of these out — even temporarily, even "to test something" — is a locked-choice violation and the task fails regardless of whether the feature works.

---

## 3. What Must Never Happen

Every item below is a direct order. Breaking any one of them means the task has **failed**, even if the app runs, even if the demo looks fine. PRD section references are given where they exist.

1. **Never let an agent (you) write API keys into `.env`.** The human writes real key values into `.env` by hand. You may write `.env.example` with commented placeholders only, never real key values, never even plausible-looking fake ones in the real `.env`. *(Engineering requirements; Traps)*

2. **Never store the uploaded file in the database.** Only the storage key/reference goes in the database. The file itself lives in object storage or the documented local equivalent. *(Engineering requirements; Traps)*

3. **Never hardcode the model identifier, timeout, output token cap, temperature, rate limit, or concurrency value inside a route handler or business logic file.** Every one of these values lives in a single configuration file and is imported from there. If you find yourself typing a model name or a number like `4096` directly into a handler, stop and move it to config. *(Engineering requirements; Traps)*

4. **Never parse the model's raw text output with string operations (regex, `.split()`, manual scanning) to extract data.** You must request structured output using a schema, and validate what comes back in your own application code — not just trust the provider's schema enforcement. Define what happens on a failed validation: a retry, and a graceful failure after that. *(Engineering requirements; Grading bands: Excellent)*

5. **Never treat a `200` response from the upload endpoint as proof the work succeeded.** The upload endpoint's job is only to accept the request and create a job record. The actual AI work happens in the background job, and the job's status is the only source of truth for success or failure. *(Behaviour; Traps)*

6. **Never let the upload request block on the AI call.** Upload must create a job and return immediately; the model call happens in a background job, not inline in the request/response cycle. *(Behaviour)*

7. **Never let two AI roles share one undifferentiated prompt.** You must implement either two distinct models routed by task, or one model with two clearly separate, clearly named system prompts, each serving a distinct role. Do not blend them into one "do everything" prompt. *(Behaviour)*

8. **Never allow uploads to fire unlimited simultaneous provider calls.** A queue or a concurrency cap must actually hold this limit — not just exist in code but never be exercised. If a user uploads many files, the number of simultaneous provider calls must stay bounded and you must be able to demonstrate this. *(Engineering requirements; Grading bands: Excellent)*

9. **Never skip a timeout on a model call.** Every call to a model must have a timeout and a defined fallback behaviour for when it fires. No call is allowed to hang indefinitely. *(Engineering requirements)*

10. **Never skip rate limiting on the endpoint that triggers processing or on the follow-up action endpoint.** Both must be rate limited, not just one. *(Engineering requirements; Traps)*

11. **Never hide a failure from the user.** If a job fails, the user is told the truth, with an honest processing/failed state — not a spinner that never resolves, not a generic error swallowed silently. *(Behaviour)*

12. **Never skip the job record.** Every unit of work gets a database row holding status, number of attempts, and the error message on failure. This is not optional logging — it is a required data model element. *(Engineering requirements)*

13. **Never build outside the brief.** No landing page, no marketing page, no account features beyond what is needed to have a signed-in user (reusing Assessment 1's auth is explicitly fine), no editing, sharing, or exporting features. If it is not named in the PRD's "What to build" or "Screens" sections, do not build it. *(Do not build)*

14. **Never test only the happy path.** Before this slice is considered done, it must have been exercised against an empty file, a corrupted file, and a file at the exact size limit — not just three clean inputs. *(Traps)*

15. **Never let the interface claim a state the database doesn't back.** If the interface shows "processing," a job record with status `processing` must actually exist. Countdown timers, progress states, or success messages are never allowed to be pure interface theatre with no backing data.

---

## 4. How Is the Work Arranged

Use this folder layout. Do not invent a different top-level structure, and do not collapse these boundaries into fewer files "for simplicity."

```
/prisma
  schema.prisma              # all models: User (or reused), UploadJob, AiResult, etc.
  migrations/

/src
  /app                        # Next.js routes/screens only — no business logic here
    /upload                   # upload screen
    /jobs/[id]                # processing / result screen for one job
    /api
      /upload/route.ts        # accepts file, creates storage object + job row, returns fast
      /jobs/[id]/route.ts     # returns job status for polling
      /jobs/[id]/followup/route.ts  # the one follow-up action

  /server
    /config
      ai.config.ts            # THE ONLY place model ids, temperature, timeouts, token caps,
                               # rate limits, and concurrency values are defined
    /ai
      client.ts                # official SDK client setup, nothing else
      prompts/
        role-one.prompt.ts     # system prompt for role 1, with each param's reason as a comment
        role-two.prompt.ts     # system prompt for role 2
      schemas/
        result.schema.ts       # the structured output schema + your own validation
      run-model.ts             # wraps SDK call: applies timeout, fallback, retry logic
    /jobs
      queue.ts                 # concurrency cap / queue implementation
      worker.ts                # picks up job rows, calls run-model, writes results back
      job-repository.ts        # all Prisma reads/writes for job rows live here, nowhere else
    /storage
      storage-client.ts        # object storage (or documented local equivalent) wrapper
    /rate-limit
      rate-limiter.ts          # shared limiter used by upload route and follow-up route
    /db
      prisma.ts                # single Prisma client instance

.env
.env.example
DOCUMENTATION.md
AGENTS.md
```

Rules about this layout:

- **Handlers in `/app/api` stay thin.** They validate the request, call into `/server`, and return. They never contain model calls, prompt text, or Prisma queries directly.
- **All Prisma access for jobs goes through `job-repository.ts`.** No `prisma.uploadJob.*` calls scattered across route files.
- **All model-facing configuration lives in `ai.config.ts`.** Nothing outside that file is allowed to define a model name, a timeout number, a token cap, a temperature value, a rate limit number, or a concurrency number.
- **The worker never touches the request/response cycle.** It is triggered by the queue, not called directly from a route handler in a way that blocks the response.
- **Storage access is only ever through `storage-client.ts`.** No direct filesystem or bucket SDK calls elsewhere.

---

## 5. How the Code Should Look

- Write TypeScript with strict mode on. No `any` used to sidestep a type you don't want to define. No `@ts-ignore` to silence an error you don't understand — fix the type or ask.
- Use the current LTS versions of Next.js, TypeScript, Prisma, and Node. Do not pin to an old version out of habit, and do not reach for a bleeding-edge canary release either.
- Keep functions small and named for what they do. A function called `runModel` runs a model call; it does not also write to the database and also check rate limits.
- No dead code, no commented-out blocks left in place, no unused imports.
- Every non-obvious decision (a timeout value, a retry count, a concurrency cap number) gets a one-line comment saying why that number, not just what it is.
- Errors are caught and handled explicitly at the layer that knows what to do about them. Do not let an unhandled promise rejection be the failure mode for a model call — that is exactly the kind of failure the job record exists to capture.
- Commit history should show incremental work as the build progresses, not one giant commit at the end.

---

## 6. What Counts as Done

Before this slice is considered complete, confirm every item below. This is not a suggestion list — it is the acceptance checklist.

**Screens**
- [ ] Upload view exists, enforces file size and type restrictions
- [ ] Processing state exists and truthfully shows pending, processing, done, or failed
- [ ] Result view shows the structured output
- [ ] Exactly one follow-up action exists on the result (summarise / rephrase / expand — pick one)

**Behaviour**
- [ ] Upload returns immediately and creates a background job; it does not block on the model call
- [ ] Two AI roles are implemented (two models, or one model with two distinct named system prompts)
- [ ] Output is structured data, validated in application code, not guessed at from prose
- [ ] Failures are recorded on the job row and shown honestly in the interface

**Engineering requirements**
- [ ] Official SDK used for the AI provider(s)
- [ ] `.env` written by hand with real values (never by the agent); `.env.example` has commented placeholders and is committed
- [ ] Single config file holds model ids, timeouts, token caps, temperature, rate limits, concurrency
- [ ] System prompt per role written out, each set parameter justified in one line
- [ ] Structured output requested via schema, validated on receipt, with a defined retry and a defined graceful failure
- [ ] Job record exists per unit of work: status, attempts, error message
- [ ] Queue or concurrency cap implemented and demonstrably holds under load
- [ ] Rate limiting present on both the trigger endpoint and the follow-up endpoint
- [ ] Files stored in object storage (or documented local equivalent); only the storage key is in the database
- [ ] Every model call has a timeout and a defined fallback

**Proof**
- [ ] Screenshot of jobs table showing one successful and one failed run, error message visible
- [ ] Raw model output shown next to the validated, parsed result
- [ ] Evidence of a deliberately broken schema/response and what happened as a result
- [ ] Evidence the concurrency cap held during a multi-file upload
- [ ] Screenshot showing the database holds a storage key, not the file

**Build**
- [ ] `npm run build` (or equivalent) completes with zero errors
- [ ] No TypeScript errors
- [ ] No console errors on the upload, processing, or result screens during a normal run

**Documentation**
- [ ] `DOCUMENTATION.md` exists at repo root with all 8 required sections, in order
- [ ] Section 5 covers every required concept with all four sub-questions answered, including "what I chose against"
- [ ] Section 6 contains at least three genuine problems hit during the build

If any box is unchecked, the task is not done — regardless of how the demo looks.

---

## 7. What the Agent Does When Unsure

- **Never invent a feature or expand scope to fill a gap.** If the PRD or this file doesn't specify something, choose the smallest, most boring option that satisfies the stated requirement — do not add a feature to "make it more complete."
- **Never guess at a locked choice.** If you are unsure whether something counts as touching the locked stack (Next.js / TypeScript / Prisma / PostgreSQL / official SDKs / object storage), treat it as locked and ask before changing it.
- **Never patch around a rule in Section 3 with a workaround.** For example, if structured output validation is inconvenient, the answer is never "just parse the string this one time" — that is the exact trap this file forbids. Stop and flag it instead.
- **Never write speculative, half-finished, or "just in case" code.** No spaghetti. No commented-out alternate implementations left in the codebase. No TODO-driven scaffolding for features not in the PRD.
- **If a requirement is genuinely ambiguous** (for example, which domain to pick, or which two AI roles to use), pick the simplest reasonable interpretation, state the assumption clearly in `DOCUMENTATION.md`, and proceed — do not block on it, and do not silently pick something without noting it.
- **If a rule in this file and a convenience shortcut are in tension, the rule wins, every time**, even if the shortcut is faster, even if it's "basically the same thing."
- When truly stuck between two valid approaches with no clear answer in the PRD or this file, stop and ask a specific, narrow question rather than proceeding on a guess.
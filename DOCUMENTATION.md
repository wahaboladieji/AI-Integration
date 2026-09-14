# DOCUMENTATION.md

## Section 1: What This Is

This is a flow where a user uploads a photo or scan of handwritten notes, and a background job sends it through two AI models to turn it into clean, organized, structured text. The first model reads the handwriting and extracts the raw text. The second model takes that raw text and structures it into an organized result, and can also produce a summary of it on request.

What is deliberately not included: there is no landing page, no marketing page, no editing, sharing, or export features. No authentication system was implemented in this slice. This was a deliberate time tradeoff, not an oversight, and is explained further in Section 7.

---

## Section 2: How To Run It

1. Clone the repository.
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in the real values:
   - `DATABASE_URL` — your local PostgreSQL connection string
   - `GEMINI_API_KEY` — from Google AI Studio, used for the handwriting extraction step
   - `DEEPSEEK_API_KEY` — from DeepSeek's platform, used for the structuring and summarizing step
4. Set up the database: `npx prisma migrate dev`
5. Start the app: `npm run dev`
6. It appears at: `http://localhost:3000`, with the upload screen at `/upload`

No object storage provider is used. Uploaded files are handled through a local development storage setup rather than a cloud storage service.

---

## Section 3: The Flow, Step By Step

1. **User selects a file.** They visit the upload screen (`/src/app/upload`) and choose a file (a photo or scan of their handwritten notes).
2. **User confirms with the submit button.** The file does not start processing automatically after selection. The user has to click the submit button before anything is sent to the server. This is a deliberate checkpoint so the user controls when the upload actually begins.
3. **The upload route validates and hands off.** The frontend sends the file to `POST /src/app/api/upload/route.ts`. The route checks file size and type server-side, stores the file through the local storage setup, creates a job row with status `pending`, and returns immediately. It does not wait for the AI model.
4. **The worker picks up the job.** The worker moves the job to `processing` and calls Gemini first, to extract the raw handwritten text from the file.
5. **The result is passed to the second model.** The extracted text is sent to DeepSeek, which structures it into organized, clean text following the required schema.
6. **The result comes back and gets validated.** The response is checked against a schema in application code. If it passes, the job moves to `done` and the structured result is saved. If it fails, one retry happens, and if that also fails, the job moves to `failed` with a real error message.
7. **The user sees the result.** The frontend at `/src/app/jobs/[id]` reads `GET /src/app/api/jobs/[id]/route.ts` and shows the honest current state: pending, processing, done, or failed.
8. **The user triggers the follow-up action.** They click Summarise, which sends a request to `POST /src/app/api/jobs/[id]/followup/route.ts`. This creates a second job row, using DeepSeek again, and goes through the same processing and validation steps as above.

---

## Section 4: The Data Model

**Job table** — holds one row per unit of work (an upload, or a follow-up action).

| Column | Type | Why |
|---|---|---|
| `id` | UUID/cuid | primary key |
| `status` | enum (`pending`, `processing`, `done`, `failed`) | avoids a free-text status field that could hold an invalid value |
| `attempts` | integer | tracks retry count |
| `errorMessage` | string, nullable | only populated on failure, so a failure is always visible and never hidden |
| `storageKey` | string | points at the file in local storage; the file content itself is never in this table |
| `rawOutput` | JSON or text, nullable | the raw text extracted by the first model, before structuring |
| `resultsData` | JSON, nullable | the final validated, structured result, once the job is `done` |
| `userId` | foreign key | links a job to the user it belongs to |
| `createdAt` / `updatedAt` | timestamp | standard |

**Which constraints make an invalid state impossible:**
- The `status` enum makes it impossible to store a status value outside the four defined states.
- Keeping `rawOutput` and `resultsData` as two separate columns, rather than one combined `results` field, means the raw extraction and the final structured version are never confused with each other, and both stay available for the "raw output next to validated result" evidence the assessment asks for.
- `errorMessage` being nullable and only written on the `failed` path means a successful job can never carry a leftover error message from an earlier failed attempt.
- The `userId` foreign key ties every job to a user record, even though full authentication was not implemented in this slice (see Section 7 for why).

---

## Section 5: The Concepts

### What an API Endpoint Is

**What it is.** An API endpoint is a specific URL and method (like `POST /api/upload`) that the frontend can call to ask the server to do something, and get a response back.

**Why it is needed.** Without a defined endpoint, the frontend has no safe, structured way to hand a file to the server or ask about a job's status. It would have to talk to the database or the AI provider directly, which would expose credentials and business logic to the browser.

**How I implemented it.** Three Next.js route handlers. The first handles the upload. The second returns the true, current database state of a job. The third triggers the one follow-up action, Summarise.

**What I chose against.** A separate backend service, such as Express, was not used, since the stack was locked to Next.js from the start. Running two servers for this one flow would add deployment complexity with no real benefit at this scale.

---

### SDKs Versus Raw HTTP

**What it is.** An SDK is a pre-built code library a provider publishes so you call their API through normal function calls instead of constructing raw HTTP requests by hand.

**Why it is needed.** Without it, you are responsible for manually handling authentication headers, retries, and parsing the response format yourself. Any small mistake there fails silently and is hard to trace back to the actual cause.

**How I implemented it.** Google's GoogleGenAI SDK was used for Gemini. DeepSeek does not have its own dedicated SDK for this stack, so the OpenAI SDK was used instead, pointed at DeepSeek's API endpoint, since DeepSeek's API is built to be compatible with the OpenAI client format.

**What I chose against.** Writing raw `fetch` calls directly to either provider's REST endpoint was rejected. Using an SDK, even a compatible one rather than a provider-specific one for DeepSeek, keeps authentication, retries, and response parsing handled by tested library code instead of custom code.

---

### System Prompts Versus User Prompts

**What it is.** A system prompt sets the AI model's role and instructions before it sees any real input. It is the model's job description. A user prompt is the actual content being processed on a given call.

**Why it is needed.** Without a clear system prompt per role, the same model has to guess what task it is doing from the input alone, which makes its output inconsistent between the two roles this flow needs.

**How I implemented it.** Two distinct system prompts are used, one per role. The DeepSeek prompt, which handles structuring and organizing the text, went through a refinement pass: an initial version was written first, then improved specifically for the structuring and organization task, to make its output more consistent.

**What I chose against.** One blended prompt handling both handwriting extraction and structuring was rejected. The two tasks need different instructions and different output shapes, so mixing them into one prompt would make the model's behavior unpredictable depending on which task it thought it was doing.

---

### Model Parameters

**What it is.** Model parameters are the settings sent with each API call that shape the output, such as temperature, how many tokens the model can return, and how long to wait before giving up.

**Why it is needed.** Leaving these at provider defaults means behavior can change silently if a provider changes its defaults, and an unset token cap can let a single call run, and cost, far more than intended.

**How I implemented it.** All values live in one config file, `ai.config.ts`. The parameters that matter most for this flow are:

| Setting | Value | Why |
|---|---|---|
| Role 1 model (handwriting extraction) | `gemini-3.6-flash` | Google's multimodal model, chosen for fast, accurate OCR on handwriting |
| Role 2 model (structuring) | `deepseek-chat` | chosen for structuring, rephrasing, and summarizing |
| Role 1 temperature | `0.2` | low temperature keeps handwriting extraction accurate and literal, avoiding creative guesses |
| Role 2 temperature | `0.2` | low temperature keeps the structured JSON output consistent between runs |
| Role 1 output token cap | `4096` | bounds cost while leaving enough room for long handwritten notes |
| Role 2 output token cap | `4096` | bounds cost while leaving enough room for a full structured result and summary |
| Role 1 timeout | `45` seconds | gives Gemini enough time to process larger or more complex images |
| Role 2 timeout | `30` seconds | stops the background worker from waiting too long on DeepSeek |
| Max validation retries | `1` | allows one automatic retry with error feedback before falling back to a graceful failure |
| Max job attempts | `3` | a failed background job is retried up to 3 times before it is permanently marked `failed` |

Some additional values exist in the config file, such as the provider base URL and default confidence score, but these are provider setup details or display defaults rather than parameters that shape the model's actual output, so they are left out of this table.

**What I chose against.** Hardcoding these values inside the route handler or the worker was rejected. Keeping every value in one config file means a future change does not require hunting through multiple files.

---

### Structured Output and Schema Validation

**What it is.** Structured output means asking the model to return data in a specific, predictable shape, with defined fields and types, rather than free-form text that has to be interpreted afterward.

**Why it is needed.** Without it, the code has to guess where the useful information is inside a block of prose. A small change in the model's phrasing can silently break that guesswork, and the failure will not look like a failure. It will look like a wrong answer displayed as a correct one.

**How I implemented it.** Zod is used to define the expected schema and validate the model's response against it as soon as it comes back. If validation fails, one retry is attempted with error feedback. If the retry also fails, the job is marked `failed` with a graceful, honest error message rather than a raw error being shown to the user.

**What I chose against.** Parsing the model's raw text response with string operations or regex was rejected outright. This is named directly as a trap in the assessment brief, and it would mean the code is guessing at meaning instead of checking it.

---

### Jobs and Workers

**What it is.** A job is a row in the database representing one unit of work to be done. A worker is the process that picks up pending jobs and actually does the work, in this case, calling the AI models.

**Why it is needed.** Without this split, the upload request itself would have to wait for both AI calls to finish before responding, which means a slow or failed model call would leave the user staring at a blank or frozen screen.

**How I implemented it.** A job repository handles all reads and writes to the job table. A worker picks up jobs and moves them through `pending`, `processing`, `done`, or `failed`, calling Gemini and then DeepSeek in sequence as described in Section 3.

**What I chose against.** Running the model calls directly inside the upload request handler was rejected. It would block the response and go against the requirement that upload never waits on the AI call.

---

### Queues, FIFO, and Concurrency Cap

**What it is.** A queue holds jobs waiting to be processed. A concurrency cap limits how many jobs can be actively processed, meaning actively calling an AI provider, at the same time, so the rest wait their turn.

**Why it is needed.** Without a cap, uploading many files at once would fire that many simultaneous calls to the AI providers, which can spike cost with no warning.

**How I implemented it.** The concurrency cap is set to 2 in `ai.config.ts`, meaning at most 2 jobs can be actively processed at once. This cap is currently applied per user rather than globally across all users. This is a known limitation and is covered further in Section 7.

**What I chose against.** A dedicated external queue service, such as a Redis-backed queue, was not used. An in-process concurrency limit was enough for the current scale of this project, though it would need to be revisited if the app needed to support many users at once, as noted in Section 7.

---

### Rate Limiting as a Cost Control

**What it is.** Rate limiting restricts how many requests a single user or IP can make to a given endpoint within a time window.

**Why it is needed.** The upload trigger and the follow-up action both cost money per call to the AI providers. Without a limit, one user could rapidly trigger many calls and run up cost with no natural ceiling.

**How I implemented it.** Both the upload endpoint and the follow-up action endpoint are limited to 5 requests per 60 seconds. When the limit is hit, the endpoint responds with a `429` status code.

**What I chose against.** Relying on client-side throttling alone was rejected. It is trivially bypassed by calling the endpoint directly, which is why the limit is enforced on the server.

---

### Why Files Live in Object Storage, Not the Database

**What it is.** Object storage is a system built specifically for storing files, separate from the relational database that stores structured records.

**Why it is needed.** Storing file content directly in Postgres bloats the database, makes backups slower and larger, and mixes two very different kinds of data, structured rows and raw binary content, in one system not designed for both.

**How I implemented it.** A local development storage setup is used instead of a cloud object storage provider. The database only ever stores the file's storage key, never the file content itself.

**What I chose against.** Storing the uploaded file's raw content as a column in the job table was rejected, in line with the project's rules. A real cloud object storage provider was also considered but not implemented in this slice due to time, as noted in Section 7.

---

### Cost Model

**What it is.** A rough estimate of what one processing run costs, and what actually limits how much the whole system could cost if it were misused or ran heavily.

**Why it is needed.** Without a real number, there is no way to know if this flow is affordable to run, or what would happen if the rate limit and concurrency cap were not in place.

**How I implemented it / calculated it.** I used the listed per-token prices for the two models actually configured in `ai.config.ts`.

- **Role 1 (gemini-3.6-flash):** $1.50 per 1M input tokens, $7.50 per 1M output tokens (list price through 2026, output includes thinking tokens).
- **Role 2 (deepseek-chat, DeepSeek V4-Flash):** $0.14 per 1M input tokens (cache miss), $0.28 per 1M output tokens.

Rough tokens per run (primary flow, no follow-up): Role 1 uses ~3,000 input tokens (uploaded file text/pixels + prompt) and ~4,000 output tokens (transcription, near the 4096 cap); Role 2 then uses ~4,400 input tokens (extracted text + schema prompt) and ~1,500 output tokens (structured JSON).

That works out to roughly **$0.035 USD per run**: Role 1 ≈ $0.0045 input + $0.0300 output; Role 2 ≈ $0.0006 input + $0.0004 output. Worst case, when both roles hit their output caps, a run costs ~$0.05.

The total possible spend is capped by the limits defined in `ai.config.ts`, which act together:
- **Rate limits** (`rateLimit.uploadTrigger` / `followupAction`, 5 requests per 60s per IP) bound how many cost-bearing calls one user can trigger: at most 5 new primary chains per minute, each with one Role 1 and one Role 2 call, plus up to 5 follow-up calls.
- **Concurrency cap** (`concurrency.maxConcurrentJobs = 2`) keeps at most 2 provider calls in flight at any moment, so even a rapid upload burst never exceeds the provider's rate ceiling.
- **Output token caps** (`4096` for both roles) bound the expensive output side of each call.

Worst-case sustained spend: 5 runs/min/IP × ~$0.05 ≈ $0.25/min per IP, ≈ $15/hr per IP.

**What I chose against.** I chose against using Gemini Pro (gemini-3.6-pro-class) for extraction or the follow-up: Pro's higher output price per token would roughly double the cost per run without a meaningful quality gain for this structure-preserving task, and the higher price would make the spend ceiling harder to defend. I also chose against caching input prompts, since each run's file content is unique and the ~$0.15/M cached-input saving would not repay the added complexity.

---

## Section 6: What Went Wrong

### Problem 1: Only one file could be uploaded at a time

**The symptom.** The upload screen only allowed a single file to be selected and processed per request, even though the assessment calls for accepting one or more files.

**The investigation.** The limitation was traced to both the upload screen and the upload endpoint, which were built to handle a single file input from the start.

**The cause.** The upload screen (`upload/page.tsx`) and the upload endpoint (`route.ts`) were both written to only accept a single file per request.

**The fix.** Multi-file selection was enabled on both the screen and the endpoint so more than one file can be uploaded and processed per request.

---

### Problem 2: Stale build cache caused a 500 error on the upload page

**The symptom.** Visiting `/upload` threw a 500 error: `Error: Cannot find module './331.js'`.

**The investigation.** The `npm run dev` server had been running continuously while `npm run build` was executed at the same time in a separate process.

**The cause.** Running `next build` while `next dev` was still active caused `next build` to overwrite the webpack chunks inside `.next/server`, while `next dev` was still holding references to the old chunk IDs in memory. The two processes ended up disagreeing about which chunk files actually existed.

**The fix.** The `.next` cache directory was deleted (`rm -rf .next`), forcing Next.js to recompile fresh webpack chunks from scratch.

---

### Problem 3: AI processing failed due to a deprecated Gemini model

**The symptom.** Jobs using the handwriting extraction step failed with a 404 error: `This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash for the latest features and improvements.`

**The investigation.** The codebase was searched for where `gemini-2.5-flash` was being referenced, which led to `src/server/config/ai.config.ts`, where it was set as the model identifier for Role 1.

**The cause.** Google had deprecated the `gemini-2.5-flash` model identifier and required using `gemini-3.6-flash` instead.

**The fix.** The `roleOneModelId` and `providers.gemini.defaultModel` values in `ai.config.ts` were updated to `gemini-3.6-flash` to match the currently supported model.

---

## Section 7: What This Slice Does Not Handle

- **Not built by design (in the PRD's "Do not build" section):** no landing page, no editing, sharing, or export features beyond the one follow-up action.
- **What breaks at scale:** the concurrency cap is currently applied per user, not globally across all users. With hundreds of users active at once, this means the total number of simultaneous AI calls across the whole system is not actually bounded, even though each individual user is limited to 2 active jobs. Local storage is also used for uploaded files, which would need to become a real object storage provider to support real usage at scale.
- **What you'd need before real users touched it:** a real payment or cost alert system to catch spend before it becomes a problem, and a real object storage provider in place of the local development setup.
- **Left out because it was outside the brief:** general UI improvements and polish beyond what was needed for a clean, working flow.
- **Left out because of time:** authentication was not implemented in this slice. A real object storage provider was also left out due to time, with local storage used as a stand-in instead.

---

## Section 8: If I Built This Again

The biggest thing I would change is implementing multi-file upload support from the very start, instead of building it for a single file first and reworking it afterward. I would also bring in Zod for server-side validation from the beginning of the build rather than adding it partway through, since having the structured output contract in place early would have shaped the rest of the flow more cleanly from the outset.
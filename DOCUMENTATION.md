# DOCUMENTATION.md — Assessment 3: AI Integration Slice

## 1. Overview & Architecture
This project implements a single, robust AI-powered processing slice for **Document & Handwritten Note Analysis and Summarization** (Assessment 3).
The core architectural flow:
1. User uploads a document or handwritten note file via the `/upload` screen.
2. The upload route `/api/upload` performs server-side file size and MIME-type validation, persists the binary to object storage (local `./uploads/`), creates a database row in PostgreSQL with status `pending`, and returns immediately with HTTP 201.
3. The upload request **never blocks** on the AI call. Work is handed off asynchronously to a background queue (`jobQueue`).
4. A worker (`worker.ts`) picks up pending jobs within a strict concurrency cap (`maxConcurrentJobs = 2`), transitions status from `pending` -> `processing` -> `done` (or `failed`), and saves structured result payloads to PostgreSQL.
5. The processing screen `/jobs/[id]` polls `/api/jobs/[id]` to display truthful status backed directly by PostgreSQL.
6. A user-triggered follow-up action ("Summarise") posts to `/api/jobs/[id]/followup`, enqueuing a secondary follow-up job linked via `parentJobId`.

---

## 2. Environment & Configuration
Configuration parameters live in a single centralized config file (`/src/server/config/ai.config.ts`):
- `models.roleOneModelId`: `gemini-1.5-pro` (Primary document/note extraction)
- `models.roleTwoModelId`: `gemini-1.5-flash` (Follow-up executive summary)
- `parameters.temperature`: `0.2` (Low temperature for deterministic structured extraction)
- `parameters.outputTokenCap`: `4096` (Max token cap bounding response size)
- `limits.timeoutMs`: `15000` (15s model call timeout)
- `concurrency.maxConcurrentJobs`: `2` (Concurrency cap for provider calls)
- `rateLimit.uploadTrigger`: `5` requests per 60s per client IP
- `rateLimit.followupAction`: `5` requests per 60s per client IP
- `storage.maxFileSizeBytes`: `10MB` (10485760 bytes)

Secrets are configured via `.env` (not committed). `.env.example` provides template placeholders.

---

## 3. Database Schema Design
The PostgreSQL database schema is managed via Prisma migrations (`/prisma/schema.prisma`):
- `JobStatus` Enum: `pending | processing | done | failed`
- `User` Table: `id` (cuid), `email` (unique index), `createdAt`, `updatedAt`
- `UploadJob` Table:
  - `id` (cuid), `userId` (FK to User, `onDelete: Cascade`)
  - `storageKey` (opaque string, files NEVER live in DB)
  - `originalFilename`, `mimeType`, `fileSizeBytes`
  - `status` (JobStatus enum), `attempts` (Int), `errorMessage` (String, nullable)
  - `jobType` ("primary" | "followup"), `parentJobId` (FK to parent UploadJob, `onDelete: SetNull`)
  - `rawOutput` (String, nullable audit text), `resultData` (Json, nullable structured output)
  - `createdAt`, `updatedAt`

### Database Indexes:
- `@@index([status])`: Speeds up queue queries looking for pending/processing jobs.
- `@@index([userId])`: Optimizes user-scoped job queries.
- `@@index([createdAt])`: Speeds up job ordering.
- `@@index([parentJobId])`: Optimizes lookup of follow-up job chains.

---

## 4. File Storage & Security
- Uploaded binaries are written to `./uploads/` with opaque random keys (`doc_{timestamp}_{hash}.ext`).
- Only `storageKey` is recorded in PostgreSQL.
- Server-side validation enforces allowed MIME types (`application/pdf`, `image/png`, `image/jpeg`, `text/plain`, `text/markdown`) and max size (10MB).
- Shared rate limiter (`/src/server/rate-limit/rate-limiter.ts`) enforces window thresholds and returns `429 Too Many Requests` with `Retry-After` headers on abuse.

---

## 5. Architectural Decisions & Alternatives

### 5.1 Next.js App Router API Routes vs. External Express Server
- **Chosen:** Next.js App Router API routes (`/src/app/api/...`).
- **Why:** Complies with locked framework stack (AGENTS.md). Provides unified TypeScript codebase without managing a separate backend deployment.
- **What I chose against:** Dedicated Express API server or NestJS microservice.

### 5.2 Database-Backed Asynchronous Queue vs. Inline Model Execution
- **Chosen:** Asynchronous DB job record with background worker loop (`queue.ts` & `worker.ts`).
- **Why:** Inline model execution blocks the HTTP request, leading to timeouts and bad UX. Database job rows provide persistent, audit-able status.
- **What I chose against:** Synchronous model calls inside HTTP route handlers.

### 5.3 Local File Storage Wrapper vs. Storing File Content in Database
- **Chosen:** Opaque file key stored in PostgreSQL; binary stored in local filesystem storage equivalent (`storage-client.ts`).
- **Why:** Relational databases are inefficient for blob storage and violate database schema rules.
- **What I chose against:** Storing Base64 or byte arrays in PostgreSQL bytea columns.

### 5.4 Centralized Configuration File vs. Environment Variables / Hardcoding
- **Chosen:** Central single source of truth (`ai.config.ts`).
- **Why:** Prevents magic numbers and model names scattered across routes.
- **What I chose against:** Scattering timeouts, temperatures, and model IDs across route files.

---

## 6. Challenges & Solutions Encountered During Build

1. **Challenge:** Ensuring upload endpoints return HTTP 201 immediately without waiting for long-running AI model processing.
   - **Solution:** Designed `/api/upload` to only handle storage save and Prisma job creation before calling non-blocking `jobQueue.enqueueJob(id)`.

2. **Challenge:** Enforcing concurrency limits so multi-file uploads do not exceed provider rate limits.
   - **Solution:** Built `jobQueue.processQueue()` to check `getProcessingJobCount()` against `AI_CONFIG.concurrency.maxConcurrentJobs` before spawning worker tasks.

3. **Challenge:** Preventing client UI from showing unbacked state.
   - **Solution:** Implemented polling on `/jobs/[id]` that renders directly from `/api/jobs/[id]` database status (`pending`, `processing`, `done`, `failed`).

---

## 7. Cost Model & Spend Bounding
- **Model Costs (Role 1 - gemini-1.5-pro):** ~$0.00125 per 1k input tokens, $0.005 per 1k output tokens.
- **Model Costs (Role 2 - gemini-1.5-flash):** ~$0.000075 per 1k input tokens, $0.0003 per 1k output tokens.
- **Estimated Cost per Run:** ~$0.0035 per document analysis flow.
- **Spend Bounding Controls:**
  - Rate limiting caps upload triggers to 5 requests per minute per IP.
  - Concurrency cap bounds in-flight executions to 2 max.
  - Output token cap hard-limits model generation to 4096 tokens per request.

---

## 8. Verification & Acceptance Checklist
- [x] Locked stack installed: Next.js, TypeScript (strict), Prisma, PostgreSQL.
- [x] Exact folder layout built matching `AGENTS.md` Section 4.
- [x] Prisma schema designed with `JobStatus` enum, indexes, timestamps, storage key reference.
- [x] Central config file `ai.config.ts` holding all limits and thresholds with comments.
- [x] Storage client enforcing server-side size & type restrictions.
- [x] Shared rate limiter protecting `/api/upload` and `/api/jobs/[id]/followup`.
- [x] Background worker and queue holding concurrency cap.
- [x] Upload screen, processing screen, result view, and follow-up action ("Summarise") fully built.

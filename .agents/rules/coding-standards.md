---
trigger: always_on
---

# Coding Standards

## Language & Tooling
- TypeScript strict mode is on in every project. `strict: true` in `tsconfig.json` is never disabled or weakened.
- `any` is never used to avoid typing something. If a type is genuinely unknown, use `unknown` and narrow it.
- `@ts-ignore` / `@ts-expect-error` may only be used with a comment explaining exactly why, and must be removed the moment the underlying issue is fixed.
- Use the current LTS release of Node.js, Next.js, TypeScript, and Prisma. No canary/beta versions. No pinning to old versions out of habit.

## Structure
- Follow the folder layout defined in `AGENTS.md`. Do not invent a different top-level structure and do not collapse its boundaries into fewer files.
- Route handlers (`/app/api/**`) stay thin: validate input, call into `/server`, return. No business logic, no direct Prisma calls, no model calls inside a route file.
- All database access for a given domain (jobs, payments, users) goes through one repository file for that domain. No scattered `prisma.*` calls across unrelated files.

## Code Quality
- No dead code. No commented-out blocks left in the codebase. No unused imports or variables.
- Every function does one thing and is named for what it does.
- Any non-obvious constant (a timeout value, a retry count, a cost factor, a cap) gets a one-line comment explaining why that number was chosen.
- Errors are caught and handled explicitly at the layer that knows what to do about them. No unhandled promise rejections as a failure mode for anything that writes to the database, calls an external API, or handles money.

## Build Gate
- `npm run build` (or the project's equivalent) must complete with zero errors before any work is considered done.
- Zero TypeScript errors. Zero console errors during a normal run of the feature being built.
- Linting and formatting run clean before a commit is made.

## Violations
Breaking any rule in this file is a failed task, even if the feature demos correctly. A build that passes with a suppressed type error is not a passing build.
# EduComply architecture

Baseline: Full Project Proposal v1.1 (8 Oct 2026) §9, Initial API Design v0.1 (3 Nov 2026), ER diagram.

## Overview

```
Browser ──► React (Vite) ──/api/v1──► Express API (modular monolith) ──► Prisma ──► Neon PostgreSQL
                                            │                          └────────► Redis (sessions, rate limits, hot state)
                                            └──► OpenID Connect provider (institutional login)
Video files ──► S3 + CloudFront (signed URLs; never through the API)       [Sprint 3]
```

- **One deployable backend**, split into modules with explicit boundaries (proposal §9: four students cannot justify microservices). Modules can be extracted later.
- **Clean Architecture inside each module**: `domain → application → infrastructure / presentation`. See [backend/src/modules/README.md](../backend/src/modules/README.md).
- **Server is authoritative** for progress, grading and certification. The browser is never trusted for compliance decisions.
- **Backend-for-frontend session**: the API performs the OIDC exchange and gives the browser only an HttpOnly session cookie. No tokens in browser storage.
- **Same origin in development**: Vite proxies `/api` to the backend so cookies work without CORS.

## Request pipeline (backend)

`helmet` → `pino-http` request logging (credentials redacted) → JSON body (100 kB limit) → module routers under `/api/v1` → 404 → error handler (RFC 9457 `application/problem+json`).

Later Sprint 1 branches add: Redis session store, CSRF check, rate limits, authentication and role middleware, audit writer.

## Sprint 1 scope (proposal v1.1 §16: "Authentication and foundation")

Roles, user model, OpenID Connect flow, application shell and core CI.

| Branch                       | Delivers                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `feature/project-foundation` | **This branch.** Workspaces, React/Vite, Express/TS, modular layout, lint/format, env handling, app shells, docs |
| `feature/database-prisma`    | Prisma + Neon (`DATABASE_URL` / `DIRECT_URL`), Role/User/UserIdentity/AuditEvent, first migration, seed          |
| `feature/backend-core`       | Redis client, session store, rate limiting, health checks for DB and Redis                                       |
| `feature/auth-oidc`          | `/auth/login`, `/auth/oidc/callback`, `/auth/logout`, `/me`, role guard, CSRF, audit on sign-in                  |
| `feature/frontend-shell`     | AuthProvider, protected learner/admin routes, sign-in page                                                       |
| `feature/learner-portal-ui`  | Learner dashboard and profile built from the Figma design                                                        |
| `feature/admin-dashboard`    | Admin overview, users and roles (audited), audit log view                                                        |
| `feature/ci-pipeline`        | GitHub Actions: format, lint, typecheck, test, build on every PR                                                 |

Out of scope for Sprint 1: courses, playback, quizzes, monitoring, certificates, reports.

## Roles (API design §4)

| Role     | Access                                           |
| -------- | ------------------------------------------------ |
| LEARNER  | Own enrolments, playback, attempts, certificates |
| ADMIN    | Content, users, enrolments, settings             |
| REVIEWER | Monitoring flag review, reports, audit           |

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

## Sprint 1 data model (Task 2)

Source: ER diagram "User & Authentication"; audit fields from API Design §9. Tables use the ER's snake_case names.

```
role (id smallint PK, name UK, description)
  1 ──< user (id uuid PK, role_id FK, email UK, full_name, institutional_id UK?, user_type, department?,
              is_active, last_login_at?, created_at, updated_at)
          1 ──< user_identity (id uuid PK, user_id FK → cascade, protocol OIDC|SAML,
                               (issuer, subject) UK, linked_at, last_used_at?)
          1 ──< audit_event.actor_id (nullable, FK → restrict)
audit_event (id bigint PK, actor_id?, action, target_type?, target_id?, reason?, metadata jsonb?,
             request_id?, ip_hash char(64)?, occurred_at)   — append-only (DB trigger blocks UPDATE/DELETE/TRUNCATE)
```

- **One role per user**, as in the ER diagram (`USER.role_id`). New users default to LEARNER.
- **Identity linkage**: an external account is identified by `(issuer, subject)`; one user may have several identities (OIDC now, SAML later).
- **Audit**: written in the same transaction as the change; IPs are stored only as SHA-256 hashes; users referenced by audit events cannot be deleted.
- **Connections**: runtime → pooled `DATABASE_URL` via `@prisma/adapter-pg`; Prisma CLI → direct `DIRECT_URL`.

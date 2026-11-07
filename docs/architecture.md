# EduComply architecture

Baseline: Full Project Proposal v1.1 (8 Oct 2026) §9, Initial API Design v0.1 (3 Nov 2026), ER diagram.

## Overview

```
Browser ──► React (Vite) ──/api/v1──► Express API (modular monolith) ──► Prisma ──► Neon PostgreSQL
                                            │                          └────────► Redis (sessions, rate limits, OIDC login state)
                                            └──► OpenID Connect provider (institutional login)
Video files ──► S3 + CloudFront (signed URLs; never through the API)       [planned: Sprint 3]
```

- **One deployable backend**, split into modules with explicit boundaries (proposal §9: four students cannot justify microservices). Modules can be extracted later.
- **Clean Architecture inside each module**: `domain → application → infrastructure / presentation`. See [backend/src/modules/README.md](../backend/src/modules/README.md).
- **Server is authoritative** for progress, grading and certification. The browser is never trusted for compliance decisions.
- **Backend-for-frontend session**: the API performs the OIDC exchange and gives the browser only an HttpOnly session cookie. No tokens in browser storage.
- **Same origin in development**: Vite proxies `/api` to the backend so cookies work without CORS.

## Request pipeline (backend)

request id + `pino-http` JSON access log (method, path, status, requestId only) → `helmet` security headers → CORS (explicit allow-list) → JSON body (100 kB, strict) → module routers under `/api/v1` → 404 → central error handler (RFC 9457 problem with `code` and `requestId`).

Shared building blocks (Task 3): `validate()` (Zod, strict), `rateLimit()` with Redis/memory stores, `RedisTtlStore` for expiring JSON (sessions, OIDC state), `startServer()` with graceful shutdown (drain HTTP, then close PostgreSQL and Redis).

### Authentication (Task 4)

```
Browser ── GET /auth/login ──► API ── 302 (PKCE S256, state, nonce) ──► Keycloak
   ▲                            │  state → Redis oidc-state (10 min, one-time) + ec_login cookie
   │                            ▼
   └── 302 portal ◄── API ◄── GET /auth/oidc/callback?code&state ◄── Keycloak
        ec_session + ec_csrf      code exchange (client secret + PKCE verifier), ID token validated
                                  (iss, aud, exp, nonce), user synced in PostgreSQL + audit,
                                  new session id → Redis session (8 h idle)
```

Layers: `auth/application` (AuthService and ports: IdentityProvider, UserDirectory, SessionRepository, LoginStateRepository), `auth/infrastructure` (openid-client adapter, Redis repositories), `auth/presentation` (cookies, guards, router); user sync and admin services in `users/infrastructure` (Prisma). `src/composition.ts` wires the real adapters; tests inject fakes.

Guards: `authenticated` = session lookup (fail closed on Redis errors → 503) + CSRF for unsafe methods + per-user rate limit; `requireRole(...)` → 403 FORBIDDEN, logged with user id and path only.

### Health

| Endpoint             | Meaning                                                                                    | Codes     |
| -------------------- | ------------------------------------------------------------------------------------------ | --------- |
| `GET /api/v1/health` | Liveness — process is running (no dependency calls)                                        | 200       |
| `GET /api/v1/ready`  | Readiness — PostgreSQL and Redis reachable (5 s timeout each); `/health/ready` is an alias | 200 / 503 |

Readiness body: `{ "status": "ready" | "not_ready", "checks": { "database": {status, latencyMs, code?}, "redis": {…} } }` — status and error codes only, never connection details.

## Sprint 1 scope (proposal v1.1 §16: "Authentication and foundation")

Roles, user model, OpenID Connect flow, application shell and core CI.

All Sprint 1 work was delivered on one branch, `feature/project-foundation` (pull request #1), as a sequence of commits:

| Area           | Delivered                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Foundation     | Workspaces, React/Vite, Express/TS, modular layout, lint/format, env handling, docs                                              |
| Database       | Prisma + Neon (`DATABASE_URL` / `DIRECT_URL`), Role/User/UserIdentity/AuditEvent, first migration, role seed                     |
| Backend core   | Redis client, session store, rate limiting, CORS, request ids, readiness for DB and Redis                                        |
| Authentication | `/auth/login`, `/auth/oidc/callback`, `/auth/logout`, `/me`, role guard, CSRF, audit on sign-in, role-based landing page         |
| Portals        | AuthProvider, protected learner/admin routes, learner portal (Figma), admin dashboard, users and roles (audited), audit log view |
| DevOps         | `npm run dev` supervisor and doctor, Docker images and Compose, GitHub Actions (quality, secrets, Docker, integration)           |

Out of scope for Sprint 1: courses, playback, quizzes, monitoring, certificates, reports.

## Roles

| Role     | Sprint 1 (implemented)                                              | Planned (API design §4)                                   |
| -------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| LEARNER  | Learner portal; own profile (`GET /me`)                             | Own enrolments, playback, attempts, certificates          |
| ADMIN    | Admin portal; user search/detail, role changes (audited), audit log | Content, question banks, enrolments, flag review, reports |
| REVIEWER | Admin portal (dashboard, monitoring, reports, audit log; read-only) | API design: monitoring flags only; audit log for AUDITOR  |

The REVIEWER/AUDITOR split is an open client question (API design §11 Q3); see [sprint1-alignment.md](sprint1-alignment.md). No AUDITOR role exists yet.

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
- **Audit**: written in the same transaction as the change; IPs are stored only as keyed HMAC-SHA-256 values (`AUDIT_IP_HASH_KEY`, required in production); users referenced by audit events cannot be deleted.
- **Connections**: runtime → pooled `DATABASE_URL` via `@prisma/adapter-pg` (TCP 5432) or `@prisma/adapter-neon` (WebSocket 443, `DATABASE_TRANSPORT=websocket`); Prisma CLI → direct `DIRECT_URL`.
- **Role changes** lock all active ADMIN rows (`SELECT … FOR UPDATE`) before the last-administrator check, so concurrent demotions cannot remove every administrator.

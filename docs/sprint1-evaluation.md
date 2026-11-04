# EduComply — Sprint 1 evaluation guide

Evaluation: **6 November 2026** · Branch `feature/project-foundation` · Pull request #1 (open, not merged)

## 1. What EduComply is

EduComply is an institutional platform for **video-based compliance training and interactive assessment**. Learners watch assigned training videos and complete assessments; administrators manage users, content and reports; reviewers oversee monitoring and the audit trail.

## 2. The problem it solves

Institutions must prove that staff and students completed mandatory training (safety, data protection, academic integrity). Today this is often spreadsheets, e-mail and unverifiable video links. EduComply provides:

- one institutional sign-in (no separate passwords),
- role-based portals for learners and administrators,
- a tamper-evident (append-only) audit trail of who did what,
- later: tracked video viewing, assessments, certificates and compliance reports.

## 3. Sprint 1 objectives (Jira) and status

| Issue    | Objective                              | Status in this build                                                                                                                                                                                                                 |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SCRUM-12 | Learner and administrator roles        | Done. Roles `LEARNER`, `ADMIN`, `REVIEWER` in PostgreSQL; new users are LEARNER; audited role changes (admin screen or `db:grant-role`); every admin API checks the role on the server.                                              |
| SCRUM-13 | OpenID Connect authentication          | Done. Keycloak, authorization code flow with PKCE, state and nonce; tokens stay on the server; HttpOnly session cookie in Redis; CSRF protection; logout ends the Keycloak session too.                                              |
| SCRUM-14 | PostgreSQL and Prisma models           | Done for identity and audit: `Role`, `User`, `UserIdentity`, `AuditEvent` (append-only by database trigger) on Neon PostgreSQL via Prisma 7. Course, video and assessment models are later sprints.                                  |
| SCRUM-15 | React application shell and navigation | Done. Learner portal (Figma design) and admin portal share one shell; sign-in sends each user to the portal of their role; protected routes; responsive sidebar. Several pages show labelled demonstration data (see §13).           |
| SCRUM-16 | Docker Compose and GitHub Actions CI   | Done. Compose runs Redis, Keycloak and (profile `app`) the backend and frontend images with health checks; GitHub Actions runs format, lint, typecheck, builds, unit tests, a secret scan, Docker builds and live integration tests. |

## 4. Technology stack

| Layer          | Technology                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| Frontend       | React 19, TypeScript, Vite, React Router                                    |
| Backend        | Node.js, Express 5, TypeScript, Zod validation, Pino logging                |
| Identity       | Keycloak 26 (OpenID Connect), `openid-client`                               |
| Database       | Neon PostgreSQL (serverless), Prisma 7 (TCP or WebSocket transport)         |
| Sessions       | Redis 8                                                                     |
| Infrastructure | Docker Compose, nginx (production frontend image), GitHub Actions, Gitleaks |

## 5. Architecture overview

```
Browser ──► React portal (Vite dev server or nginx)
               │  same origin: /api/* proxied
               ▼
           Express API (modular monolith: auth · users · audit · health)
               │                  │                     │
               ▼                  ▼                     ▼
        Keycloak (OIDC)     Redis (sessions,       Neon PostgreSQL
        sign-in, logout     rate limits)           (Prisma: users, roles,
                                                    identities, audit)
```

- **Backend-for-frontend:** the browser never sees OAuth tokens, only an opaque HttpOnly session cookie.
- **Server-side authorisation:** the role is read from the database on every request; the UI only mirrors it.
- Details: [docs/architecture.md](architecture.md) and [docs/development.md](development.md).

## 6–12. Demonstration (5–7 minutes)

### Before the session (10 minutes, not shown)

```bash
# Docker Desktop running ("Engine running")
npm run dev:deps          # Redis + Keycloak healthy
npm run dev:doctor        # everything ✔ (if it recommends DATABASE_TRANSPORT=websocket, set it in .env)
npm run dev               # leave this terminal open (fallback: npm run docker:up)
npm run dev:health        # second terminal: liveness, readiness, frontend, proxy all ✔
```

Use the test accounts **learner1** (LEARNER) and **admin1** (ADMIN) whose passwords you keep privately; passwords are never stored in the repository. Use a private/incognito browser window so no earlier session is reused.

### Live sequence

| Time | Show                                                                                                                                                                                                                                                                                        | Say                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 0:00 | http://localhost:5173 — welcome page with one button and "API: online"                                                                                                                                                                                                                      | Problem and goal (§1–2).                                                         |
| 0:45 | **Learner login:** _Sign in with institutional account_ → Keycloak → sign in as `learner1` → lands on **/learner/dashboard** with the learner menu. Refresh the page: still signed in.                                                                                                      | OIDC + PKCE; session in Redis; the portal comes from the database role.          |
| 1:45 | **Access control:** type http://localhost:5173/admin/users → "You don't have access". DevTools → Network: `GET /api/v1/users` from the console returns **403**.                                                                                                                             | The server enforces roles; the UI cannot be bypassed.                            |
| 2:30 | **Log out** → back on the welcome page; `/api/v1/me` now returns 401.                                                                                                                                                                                                                       | Logout ends both the EduComply session and the Keycloak session.                 |
| 3:00 | **Administrator login:** sign in as `admin1` → lands on **/admin/dashboard** with the admin menu. Open **User Management** (real users from PostgreSQL) and **Audit Events** (sign-ins, logouts, the earlier role change).                                                                  | Roles are never taken from Keycloak; ADMIN was granted with an audited command.  |
| 4:15 | **PostgreSQL / Prisma:** terminal `npm run db:inspect` (tables and row counts, no secrets) and `npm run db:status` (migrations up to date). Both connect over TCP 5432; if the network blocks it, show `backend/prisma/schema.prisma` and the User Management / Audit Events pages instead. | Prisma models: Role, User, UserIdentity, AuditEvent; audit rows are append-only. |
| 5:00 | **Redis + health:** `npm run dev:health` → readiness shows `database: up`, `redis: up`.                                                                                                                                                                                                     | Sessions and rate limits live in Redis.                                          |
| 5:30 | **Docker:** `npm run docker:ps` (Redis, Keycloak healthy). Optional if time allows: Ctrl+C the dev server, `npm run docker:up`, open the same URL again.                                                                                                                                    | Same URLs in Docker; one project name, localhost-only ports, health checks.      |
| 6:15 | **GitHub Actions:** open the repository's _Actions_ tab → latest run on `feature/project-foundation`: four green jobs (quality, secret scan, Docker, integration).                                                                                                                          | CI runs without secrets, against temporary PostgreSQL/Redis/Keycloak.            |
| 6:45 | Limitations and next sprints (§13–14).                                                                                                                                                                                                                                                      |                                                                                  |

### If something goes wrong

| Symptom                           | Action                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` refuses to start    | Read the message; `npm run dev:doctor` explains port owners. `npm run dev:stop -- --include-unmanaged`.                 |
| Readiness shows `database: down`  | `npm run dev:doctor`. If TCP 5432 is blocked, set `DATABASE_TRANSPORT=websocket` in `.env` and restart.                 |
| Admin lands in the learner portal | That account is still LEARNER: `npm run db:grant-role -- --email <email> --role ADMIN --reason "<why>"`, sign in again. |
| Vite or the backend misbehaves    | Ctrl+C, then `npm run docker:up` (production build, same URLs).                                                         |

## 13. Sprint 1 limitations (say these openly)

- **Demonstration data:** the learner dashboard, My Training, Assessments, My Progress, Calendar, and the admin Courses, Videos, Question Banks, Monitoring, Certificates and Reports pages show clearly labelled sample content or "arrives in Sprint N" notices. Real data exists only for sign-in, users, roles, sessions and the audit log.
- Learner **Settings** are not saved yet; the page says so.
- One role per user (by design of the data model); the landing-page priority (ADMIN, REVIEWER, LEARNER) is ready for several roles.
- Keycloak runs in development mode locally; production needs HTTPS (the backend refuses non-HTTPS URLs when `NODE_ENV=production`).
- Database migrations need a network that allows TCP 5432; the running app can use the WebSocket transport (port 443).
- The application needs internet access to Neon; it is not offline-capable.

## 14. Planned for later sprints

| Sprint | Planned                                                                           |
| ------ | --------------------------------------------------------------------------------- |
| 2      | Courses, enrolments, learner assignment; real learner dashboard and training list |
| 3      | Video upload, storage and tracked playback                                        |
| 4      | Question banks, interactive assessments, results and progress                     |
| 5      | Monitoring flags, certificates                                                    |
| 6      | Reports and exports, calendar, saved settings and notifications                   |

## Quick reference

```bash
npm run dev:deps        # Redis + Keycloak
npm run dev:doctor      # diagnose everything (read-only)
npm run dev             # app at http://localhost:5173 (Ctrl+C stops)
npm run dev:health      # health of a running app
npm run docker:up       # complete app in Docker (stop npm run dev first)
npm run docker:stop     # stop the Docker app
npm run db:inspect      # tables and row counts (read-only)
npm run db:status       # migration status (read-only)
npm run check           # format, lint, typecheck, unit tests, builds
```

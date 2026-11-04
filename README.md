# EduComply

Institutional Video Training and Interactive Assessment Platform.

EduComply delivers mandatory compliance training (IT security, harassment prevention, ethics) with server-validated video progress, assessments, presence monitoring and verifiable certificates. See the Full Project Proposal v1.1 for scope.

## Tech stack

| Layer    | Technology                                                                        |
| -------- | --------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, React Router, Inter (self-hosted)                     |
| Backend  | Node.js, Express 5, TypeScript, Zod, Pino — modular monolith (Clean Architecture) |
| Data     | Neon PostgreSQL, Prisma 7 (pg driver adapter), Redis 8 (node-redis)               |
| Identity | OpenID Connect via backend-for-frontend session _(Sprint 1)_                      |
| Quality  | ESLint, Prettier, Vitest, Supertest                                               |

## Repository layout

```
EduComply/
├── backend/                 Express API  (@educomply/backend)
│   ├── src/
│   │   ├── config/env.ts    validated environment configuration
│   │   ├── modules/         one folder per business module (see modules/README.md)
│   │   ├── shared/          logger, HTTP error model (RFC 9457), database client
│   │   ├── generated/       Prisma Client (generated, git-ignored)
│   │   ├── app.ts           Express app factory
│   │   └── server.ts        process entry point
│   ├── prisma/              schema.prisma, migrations/, seed.ts
│   ├── scripts/             db-inspect, grant-role (development tools)
│   ├── prisma.config.ts     Prisma CLI configuration
│   └── tests/               Vitest + Supertest (tests/db = database integration)
├── frontend/                React app  (@educomply/frontend)
│   └── src/
│       ├── components/      shared UI and layout (AppShell)
│       ├── pages/           route-level pages
│       ├── lib/api.ts       typed API client
│       ├── navigation.ts    learner and admin navigation
│       └── styles/          design tokens and global styles
├── tools/dev/               npm run dev supervisor, doctor and Docker helpers (+ tests)
├── infra/keycloak/          development realm (imported on first Keycloak start)
├── docs/                    architecture, development runbook and design notes
├── .github/workflows/       GitHub Actions CI (ci.yml)
├── docker-compose.yml       Redis + Keycloak (+ backend/frontend with profile "app")
├── .dockerignore            keeps .env, node_modules and build output out of images
├── .gitleaks.toml           secret-scanning rules used by CI
├── .env.example             environment template (copy to .env)
├── eslint.config.js         shared ESLint flat config
└── package.json             npm workspaces and root scripts
```

## Prerequisites

- Node.js **24 LTS** recommended (CI and the Docker images use Node 24; minimum 20.19)
- npm 10+
- Git
- Docker Desktop (Compose v2): Redis and Keycloak always run in Docker; optionally the whole app
- A Neon PostgreSQL project (pooled and direct connection strings)

## Setup

```bash
git clone https://github.com/EduComply/EduComply.git
cd EduComply
npm install

# Create your local environment file (never commit it), then fill in the Neon URLs
cp .env.example .env              # PowerShell: Copy-Item .env.example .env

npm run auth:init-env             # once: adds Keycloak/OIDC dev settings + random secrets to .env
npm run dev:deps                  # Redis + Keycloak in Docker, waits until healthy (Docker Desktop must run)
npm run db:migrate:deploy         # apply committed migrations (non-destructive; needs port 5432 to Neon)
npm run db:seed                   # create LEARNER / ADMIN / REVIEWER roles (idempotent)
npm run dev                       # preflight checks, then frontend + backend; Ctrl+C stops both
```

Prefer containers? `npm run docker:up` runs the **complete application** (frontend, backend, Redis, Keycloak) in Docker on the same URLs; see [Docker](#docker-complete-application). Use either `npm run dev` or the Docker stack, not both at once.

Trouble starting? Run `npm run dev:doctor` — it diagnoses ports, Docker, Redis, Keycloak and Neon without changing anything. See [docs/development.md](docs/development.md).

- Frontend: http://localhost:5173
- API liveness: http://localhost:3000/api/v1/health (also proxied at http://localhost:5173/api/v1/health)
- API readiness: http://localhost:3000/api/v1/ready — `200` when PostgreSQL **and** Redis are reachable, `503` otherwise (`/api/v1/health/ready` is an alias)

The landing page shows **API: online** when the frontend can reach the backend.

## Scripts (run from the repository root)

| Command                 | Purpose                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Preflight (env, ports, Docker, Redis, Keycloak, Neon), then frontend + backend under one supervisor              |
| `npm run dev:backend`   | Same, backend only (frontend: `npm run dev:frontend`)                                                            |
| `npm run dev:doctor`    | Read-only diagnosis of the whole environment                                                                     |
| `npm run dev:deps`      | Start Redis + Keycloak (project `educomply` only) and wait until healthy                                         |
| `npm run dev:deps:stop` | Stop this project's containers (volumes kept; other projects untouched)                                          |
| `npm run dev:stop`      | Stop EduComply dev servers started by `npm run dev` (and their orphans)                                          |
| `npm run dev:health`    | Check a running app: liveness, readiness, frontend and proxy                                                     |
| `npm run docker:up`     | Build and start the complete app in Docker (refuses while `npm run dev` holds 5173/3000)                         |
| `npm run docker:stop`   | Stop the backend and frontend containers (Redis, Keycloak and all volumes kept)                                  |
| `npm run docker:build`  | Build the backend and frontend images only                                                                       |
| `npm run docker:logs`   | Last 100 log lines of the backend and frontend containers                                                        |
| `npm run docker:ps`     | Status and health of every EduComply container                                                                   |
| `npm run build`         | Compile backend to `backend/dist`, bundle frontend to `frontend/dist`                                            |
| `npm start`             | Run the compiled backend                                                                                         |
| `npm run lint`          | ESLint (zero warnings allowed)                                                                                   |
| `npm run format`        | Prettier write                                                                                                   |
| `npm run format:check`  | Prettier check                                                                                                   |
| `npm run typecheck`     | `tsc --noEmit` in both workspaces                                                                                |
| `npm test`              | Unit and HTTP tests in both workspaces + dev-tooling tests (no services needed)                                  |
| `npm run test:db`       | Database integration tests (needs `DATABASE_URL`; all writes rolled back)                                        |
| `npm run test:redis`    | Live Redis tests (needs Redis at `REDIS_URL`; test keys deleted)                                                 |
| `npm run test:keycloak` | Live OIDC tests (needs Keycloak + Redis; temporary Keycloak user removed)                                        |
| `npm run test:e2e`      | Live full stack: Keycloak login → Neon user sync/roles/audit → Redis session → admin API (DB writes rolled back) |
| `npm run redis:up`      | Start local Redis only (`npm run dev:deps` starts Redis and Keycloak)                                            |
| `npm run redis:status`  | Show Redis container health                                                                                      |
| `npm run redis:down`    | Stop the Redis container (data is ephemeral; nothing removed)                                                    |
| `npm run check`         | Format check, lint, typecheck, test and build                                                                    |

## API conventions

- Base path `/api/v1`; JSON bodies up to 100 kB.
- Every response has an `X-Request-Id` (a safe incoming value is kept, otherwise a UUID is generated). It appears in logs and error bodies.
- Errors are RFC 9457 `application/problem+json`, as in the Initial API Design §8:
  ```json
  {
    "type": "https://educomply.dev/errors/validation-failed",
    "title": "Request validation failed",
    "status": 400,
    "code": "VALIDATION_FAILED",
    "instance": "/api/v1/…",
    "requestId": "…",
    "errors": [{ "path": "body.email", "message": "Invalid email address" }]
  }
  ```
  Unexpected errors return a generic `500 INTERNAL_ERROR`; details stay in the server log.
- Validate input with `validate({ params, query, body })` from `backend/src/shared/http/validate.ts` using `z.strictObject` (unknown fields are rejected).
- Rate limiting: `rateLimit({ ...RateLimitPolicies.auth, store })` from `backend/src/shared/http/rateLimit.ts` returns `429 RATE_LIMITED` with `Retry-After`. Applied to routes from Task 4.
- CORS allows only the origins in `CORS_ORIGINS` (exact match, credentials enabled).

## Redis (temporary state)

Redis holds only short-lived data — sessions, rate-limit counters and OIDC login state. Permanent records stay in PostgreSQL.

- Every key is `REDIS_KEY_PREFIX` + namespace + parts, e.g. `educomply:session:<id>` ([keys.ts](backend/src/shared/infrastructure/redis/keys.ts)), and every value has a TTL (sessions: 8 h idle).
- The API starts even if Redis is down; it reconnects with backoff and `/api/v1/ready` returns `503` until Redis is reachable.
- Local Redis: `npm run redis:up` (Docker Desktop must be running), then `npm run redis:status` should show `healthy`. It listens on `127.0.0.1:6379` only and has no password — development only.

## Authentication (OpenID Connect, backend-for-frontend)

The API performs the OIDC Authorization Code flow with **PKCE (S256), state and nonce** and keeps all tokens server-side. The browser only receives:

| Cookie       | Contents                        | Flags                                                      |
| ------------ | ------------------------------- | ---------------------------------------------------------- |
| `ec_session` | opaque 256-bit session id       | HttpOnly, SameSite=Lax, Secure on HTTPS/production, Path=/ |
| `ec_csrf`    | CSRF token (also in `/me`)      | readable by the portal, SameSite=Lax                       |
| `ec_login`   | OIDC state (10 min, login only) | HttpOnly, Path=/api/v1/auth                                |

Sessions live in Redis (`educomply:session:<sha256(id)>`) with an **8-hour idle timeout**; the id is regenerated at every login and destroyed at logout. Every `POST/PUT/PATCH/DELETE` by a signed-in user must send `X-CSRF-Token`.

| Endpoint                                      | Access           | Notes                                                               |
| --------------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| `GET /api/v1/auth/login?returnTo=/learner`    | public           | 302 to Keycloak; `returnTo` must be a relative path                 |
| `GET /api/v1/auth/oidc/callback`              | public           | validates and signs in; failures redirect to `/?authError=<CODE>`   |
| `POST /api/v1/auth/logout`                    | signed in + CSRF | `{ "idpLogoutUrl": "…" }` — open it to end the Keycloak session too |
| `GET /api/v1/me`                              | signed in        | user, `roles`, `csrfToken`; `401 SESSION_EXPIRED` otherwise         |
| `GET /api/v1/users`, `GET /api/v1/users/{id}` | ADMIN            | search / detail                                                     |
| `PATCH /api/v1/users/{id}/roles`              | ADMIN + CSRF     | `{ "roles": ["REVIEWER"], "reason": "…" }` — audited                |
| `GET /api/v1/audit-events`                    | ADMIN, REVIEWER  | append-only audit log, newest first                                 |

Rate limits (Redis): `/auth/*` 20/min per IP (fails closed), signed-in routes 300/min per user.

**Roles.** New users always start as **LEARNER**; roles are never taken from the identity provider and existing roles are kept on later logins. Only an ADMIN (audited endpoint) or the development `db:grant-role` tool can change a role; admins cannot change their own role or demote the last admin.

**Portals and landing page.** The backend decides from the database role (never from Keycloak, the email or the browser) which portal a user may open and where they land after signing in; `GET /api/v1/me` returns both as `portals` and `homePath`.

| Role       | Portal                             | Lands on             |
| ---------- | ---------------------------------- | -------------------- |
| `ADMIN`    | admin (all admin pages)            | `/admin/dashboard`   |
| `REVIEWER` | admin (monitoring, reports, audit) | `/admin/dashboard`   |
| `LEARNER`  | learner                            | `/learner/dashboard` |

Priority if a user ever holds several roles: ADMIN, then REVIEWER, then LEARNER. A deep link (a page opened before signing in) is kept only if the user's portal allows it; otherwise the user lands on their home page. A learner opening `/admin` sees "You don't have access" and every admin API returns `403`; staff opening `/learner` are sent to the admin portal. A new account is always a LEARNER until an administrator changes the role (or `npm run db:grant-role` is run), so a person who should be an administrator must sign in once and then be granted ADMIN.

### Local Keycloak and test identities (development only)

1. `npm run auth:init-env` — writes `OIDC_*` and `KEYCLOAK_ADMIN_*` to `.env` (random secrets, never printed).
2. `npm run dev:deps` (starts Redis and Keycloak and waits until both are healthy). Realm `educomply`, client `educomply-api` (confidential, PKCE S256, no password grant, no self-registration). Admin console: http://localhost:8080 (credentials in your `.env`).
3. Create a test user — a strong password is generated and shown once:
   ```bash
   npm run kc:user -- create --username learner1 --email learner1@educomply.test --first Lea --last Learner
   ```
4. `npm run dev`, open http://localhost:5173 and click **Sign in**. The first sign-in creates the EduComply user (LEARNER).
5. Make a test admin after that first sign-in:
   ```bash
   npm run db:grant-role -- --email learner1@educomply.test --role ADMIN --reason "Sprint 1 test admin"
   ```

### Verifying sign-in and sign-out in the browser

1. `npm run dev:deps`, then `npm run dev` (frontend http://localhost:5173, API :3000), or `npm run docker:up`.
2. Open http://localhost:5173 and click **Sign in with institutional account**; sign in at Keycloak.
3. You return to http://localhost:5173/learner/dashboard. The top bar shows your name, role and **Sign out** (it reads `GET /api/v1/me`). In DevTools → Application → Cookies → `http://localhost:5173` you see `ec_session` (HttpOnly) and `ec_csrf`; DevTools → Network shows `GET /api/v1/me` → 200.
4. Click **Sign out**: `POST /api/v1/auth/logout` (with `X-CSRF-Token`) → Keycloak logout → back to http://localhost:5173/. The top bar shows **Not signed in**, `ec_session` is gone, and `/api/v1/me` returns 401.

Never reuse real institutional passwords for test identities. `npm run kc:user -- delete --username learner1` removes one; `npm run keycloak:reset` deletes the local Keycloak data and re-imports the realm (needed after changing `OIDC_CLIENT_SECRET`).

## Database (Neon PostgreSQL + Prisma)

| Command                     | Purpose                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `npm run db:validate`       | Validate `backend/prisma/schema.prisma`                                       |
| `npm run db:generate`       | Generate Prisma Client (also runs before dev, build, typecheck, test)         |
| `npm run db:inspect`        | Read-only: list tables and row counts (no connection details printed)         |
| `npm run db:status`         | Show applied / pending migrations                                             |
| `npm run db:migrate:deploy` | Apply pending committed migrations. Never resets or drops data                |
| `npm run db:migrate:create` | Author a new migration from schema changes (review the SQL before committing) |
| `npm run db:seed`           | Idempotently create the LEARNER, ADMIN and REVIEWER roles                     |
| `npm run db:grant-role`     | Development only: grant a role to a signed-in test user (audited)             |
| `npm run db:studio`         | Browse data in Prisma Studio                                                  |

- The app uses the **pooled** `DATABASE_URL`; Prisma CLI (migrations, studio) uses the **direct** `DIRECT_URL` ([backend/prisma.config.ts](backend/prisma.config.ts)).
- Never run `prisma migrate reset` or `prisma db push --force-reset` against the shared Neon database.
- The seed creates **no users or passwords**. Users are created when they first sign in through the identity provider (Sprint 1 auth task).

### Granting the ADMIN role to a test user (development only)

1. The person signs in once through the institutional/test identity provider, which creates their user and links a verified identity.
2. A developer runs:
   ```bash
   npm run db:grant-role -- --email person@uni.ac.lk --role ADMIN --reason "Sprint 1 demo administrator"
   ```
3. The script refuses to run when `NODE_ENV=production`, refuses users without a linked identity, and writes a `user.role_changed` audit event in the same transaction. Running it again is a no-op.

## Environment variables

All configuration lives in a single `.env` at the repository root; see [.env.example](.env.example) for every key.

- Each line must be `KEY=value`.
- The backend validates variables at startup ([backend/src/config/env.ts](backend/src/config/env.ts)) and reports only the _names_ of invalid variables, never their values.
- Vite reads the same file but exposes only `VITE_*` variables to the browser. Never put secrets in a `VITE_*` variable.
- Neon needs two URLs: `DATABASE_URL` (pooled, `-pooler` host) for the app and `DIRECT_URL` (non-pooled) for Prisma migrations.
- `DATABASE_TRANSPORT=tcp` (default, port 5432) or `websocket` (Neon serverless driver over 443, for networks that block 5432); see [docs/development.md](docs/development.md#neon-connectivity).
- `OIDC_INTERNAL_URL` is only for containers. Docker Compose sets it to `http://keycloak:8080` so the backend reaches Keycloak inside the Docker network, while browsers and token validation keep using `OIDC_ISSUER` (`http://localhost:8080/...`).
- `.env.example` contains placeholders only; real values live in your local `.env`. Images never contain `.env` (see `.dockerignore`); Compose passes the needed values to the backend container when it starts.

## Docker (complete application)

```bash
npm run dev:stop -- --include-unmanaged   # or Ctrl+C: npm run dev and Docker share ports 5173/3000
npm run docker:up                         # build images, start redis, keycloak, backend, frontend; waits until healthy
npm run dev:health                        # the same checks as for npm run dev
npm run docker:stop                       # stop backend + frontend (Redis and Keycloak keep running)
```

| Service    | Built from / image               | Host port (127.0.0.1 only) | Role                                                        |
| ---------- | -------------------------------- | -------------------------- | ----------------------------------------------------------- |
| `frontend` | `frontend/Dockerfile` (nginx)    | 5173 → 8080                | serves the React build, proxies `/api` to `backend:3000`    |
| `backend`  | `backend/Dockerfile` (Node 24)   | 3000                       | API; uses `redis:6379`, `keycloak:8080` and Neon (external) |
| `redis`    | `redis:8-alpine`                 | 6379                       | sessions and rate limits                                    |
| `keycloak` | `quay.io/keycloak/keycloak:26.4` | 8080                       | identity provider, realm `educomply`                        |

- Same URLs as `npm run dev`, so the registered OIDC callback `http://localhost:5173/api/v1/auth/oidc/callback`, the same-origin `ec_session`/`ec_csrf` cookies and the Keycloak realm stay unchanged.
- Health checks: Redis `PING`, Keycloak `/health/ready`, backend `/api/v1/health`, frontend `/`. Start order: Redis and Keycloak healthy, then the backend, then the frontend.
- The backend container gets `DATABASE_URL`, `DATABASE_TRANSPORT` and `OIDC_*` from `.env`; the Redis and Keycloak addresses are fixed to the internal service names.
- Every script uses `docker compose -p educomply`, so other projects' containers are never affected, and no script removes volumes.

## Continuous integration (GitHub Actions)

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on pushes to `main` and `feature/project-foundation`, on pull requests into `main`, and on demand. It uses **no repository secrets** and never contacts the real Neon database.

| Job           | What it does                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`     | Node 24, `npm ci` (npm cache), Prettier check, ESLint, Prisma schema validation, typecheck, backend and frontend builds, backend, frontend and dev-tooling unit tests                                                           |
| `secrets`     | Fails if any `.env` file is tracked; Gitleaks scans the full history (default rules plus Neon/PostgreSQL connection strings, [.gitleaks.toml](.gitleaks.toml)) with findings redacted                                           |
| `docker`      | Validates Compose (with and without the `app` profile) and builds both images                                                                                                                                                   |
| `integration` | Temporary PostgreSQL service, this repo's Redis/Keycloak Compose services and a throwaway `.env` with random secrets: migrations and seed, `test:redis`, `test:db`, `test:keycloak`, `test:e2e`, then a Docker stack smoke test |

Checks CI cannot do, so run them manually: the real Neon database (`npm run dev:doctor`, `npm run test:db`, `npm run test:e2e`) and signing in through a real browser.

## Working rules

1. One feature branch per task, e.g. `feature/auth-oidc`. Open a pull request into `main`; at least one reviewer.
2. Run `npm run check` before pushing.
3. API changes follow the Initial API Design (`/api/v1`, RFC 9457 errors).
4. Never commit `.env`, keys, credentials or real learner data.

## Learner portal (Task 5)

Ten learner screens implemented from the Figma file (frames `1:2`–`1:11`) with verified design tokens — see [docs/design/figma-learner-portal.md](docs/design/figma-learner-portal.md).

- All `/learner/*` routes require a valid session (`RequireAuth` reads `GET /api/v1/me`); expired sessions are detected when the tab regains focus. `/admin/*` additionally requires ADMIN or REVIEWER.
- Real data: the signed-in user (name, email, roles, profile fields) and sign-in/sign-out.
- **Demonstration data** (labelled on every screen, never persisted): courses, progress, assessments, quiz scoring and calendar — their APIs arrive in Sprints 2–4.
- The Course Player plays a local synthetic sample video (`frontend/public/media/`) with captions. It is a prototype: seeking is unrestricted and viewing is not tracked or validated (Sprint 3).

## Documentation

- [docs/development.md](docs/development.md) — dev workflow, port/Docker conflicts, Neon connectivity, demo runbook
- [docs/architecture.md](docs/architecture.md) — modular monolith, module map, Sprint 1 branch plan
- [docs/design/figma-learner-portal.md](docs/design/figma-learner-portal.md) — verified Figma tokens, screen→route map and deliberate deviations
- [backend/src/modules/README.md](backend/src/modules/README.md) — module layering rules

# EduComply

Institutional Video Training and Interactive Assessment Platform.

EduComply delivers mandatory compliance training (IT security, harassment prevention, ethics) with server-validated video progress, assessments, presence monitoring and verifiable certificates. See the Full Project Proposal v1.1 for scope.

## Tech stack

| Layer    | Technology                                                                        |
| -------- | --------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, React Router                                          |
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
├── docs/                    architecture and design notes
├── .env.example             environment template (copy to .env)
├── eslint.config.js         shared ESLint flat config
└── package.json             npm workspaces and root scripts
```

## Prerequisites

- Node.js **20.19 or newer** (developed on Node 26)
- npm 10+
- Git

## Setup

```bash
git clone https://github.com/EduComply/EduComply.git
cd EduComply
npm install

# Create your local environment file (never commit it), then fill in the Neon URLs
cp .env.example .env              # PowerShell: Copy-Item .env.example .env

npm run redis:up                  # local Redis in Docker (needs Docker Desktop running)
npm run db:migrate:deploy         # apply committed migrations (non-destructive)
npm run db:seed                   # create LEARNER / ADMIN / REVIEWER roles (idempotent)
npm run dev
```

- Frontend: http://localhost:5173
- API liveness: http://localhost:3000/api/v1/health (also proxied at http://localhost:5173/api/v1/health)
- API readiness: http://localhost:3000/api/v1/ready — `200` when PostgreSQL **and** Redis are reachable, `503` otherwise (`/api/v1/health/ready` is an alias)

The landing page shows **API: online** when the frontend can reach the backend.

## Scripts (run from the repository root)

| Command                | Purpose                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `npm run dev`          | Backend (tsx watch) and frontend (Vite) together                          |
| `npm run dev:backend`  | Backend only                                                              |
| `npm run dev:frontend` | Frontend only                                                             |
| `npm run build`        | Compile backend to `backend/dist`, bundle frontend to `frontend/dist`     |
| `npm start`            | Run the compiled backend                                                  |
| `npm run lint`         | ESLint (zero warnings allowed)                                            |
| `npm run format`       | Prettier write                                                            |
| `npm run format:check` | Prettier check                                                            |
| `npm run typecheck`    | `tsc --noEmit` in both workspaces                                         |
| `npm test`             | Unit and HTTP tests in both workspaces (no database needed)               |
| `npm run test:db`      | Database integration tests (needs `DATABASE_URL`; all writes rolled back) |
| `npm run test:redis`   | Live Redis tests (needs Redis at `REDIS_URL`; test keys deleted)          |
| `npm run redis:up`     | Start local Redis (`docker compose up -d redis`)                          |
| `npm run redis:status` | Show Redis container health                                               |
| `npm run redis:down`   | Stop local services                                                       |
| `npm run check`        | Format check, lint, typecheck, test and build                             |

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

## Working rules

1. One feature branch per task, e.g. `feature/auth-oidc`. Open a pull request into `main`; at least one reviewer.
2. Run `npm run check` before pushing.
3. API changes follow the Initial API Design (`/api/v1`, RFC 9457 errors).
4. Never commit `.env`, keys, credentials or real learner data.

## Documentation

- [docs/architecture.md](docs/architecture.md) — modular monolith, module map, Sprint 1 branch plan
- [docs/design/figma-learner-portal.md](docs/design/figma-learner-portal.md) — Figma analysis, design tokens, learner and admin portal structure
- [backend/src/modules/README.md](backend/src/modules/README.md) — module layering rules

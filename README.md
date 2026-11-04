# EduComply

Institutional Video Training and Interactive Assessment Platform.

EduComply delivers mandatory compliance training (IT security, harassment prevention, ethics) with server-validated video progress, assessments, presence monitoring and verifiable certificates. See the Full Project Proposal v1.1 for scope.

## Tech stack

| Layer    | Technology                                                                        |
| -------- | --------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, React Router                                          |
| Backend  | Node.js, Express 5, TypeScript, Zod, Pino — modular monolith (Clean Architecture) |
| Data     | Neon PostgreSQL + Prisma _(next branch)_, Redis _(Sprint 1)_                      |
| Identity | OpenID Connect via backend-for-frontend session _(Sprint 1)_                      |
| Quality  | ESLint, Prettier, Vitest, Supertest                                               |

## Repository layout

```
EduComply/
├── backend/                 Express API  (@educomply/backend)
│   ├── src/
│   │   ├── config/env.ts    validated environment configuration
│   │   ├── modules/         one folder per business module (see modules/README.md)
│   │   ├── shared/          logger, HTTP error model (RFC 9457)
│   │   ├── app.ts           Express app factory
│   │   └── server.ts        process entry point
│   └── tests/               Vitest + Supertest
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

# Create your local environment file (never commit it)
cp .env.example .env              # PowerShell: Copy-Item .env.example .env

npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3000/api/v1/health (also proxied at http://localhost:5173/api/v1/health)

The landing page shows **API: online** when the frontend can reach the backend.

## Scripts (run from the repository root)

| Command                | Purpose                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `npm run dev`          | Backend (tsx watch) and frontend (Vite) together                      |
| `npm run dev:backend`  | Backend only                                                          |
| `npm run dev:frontend` | Frontend only                                                         |
| `npm run build`        | Compile backend to `backend/dist`, bundle frontend to `frontend/dist` |
| `npm start`            | Run the compiled backend                                              |
| `npm run lint`         | ESLint (zero warnings allowed)                                        |
| `npm run format`       | Prettier write                                                        |
| `npm run format:check` | Prettier check                                                        |
| `npm run typecheck`    | `tsc --noEmit` in both workspaces                                     |
| `npm test`             | Vitest in both workspaces                                             |
| `npm run check`        | Format check, lint, typecheck, test and build                         |

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

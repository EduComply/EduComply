# Development environment, troubleshooting and demo runbook

## How `npm run dev` works

`npm run dev` runs `tools/dev/cli.ts`:

1. **Single instance.** If an `npm run dev` is already running (session file `.dev/session.json`, supervisor alive), it refuses and tells you where it runs.
2. **Preflight (in parallel, bounded):** `.env` keys present and valid (names only, never values) · ports 5173 and 3000 free on **both** 127.0.0.1 and ::1 · Redis PING (2.5 s) · Keycloak discovery (3 s) · Neon: DNS → TCP 5432 → PostgreSQL TLS request → certificate-verified TLS → `SELECT 1` (6 s per stage, one retry for a waking compute).
3. **Start:** backend (`tsx watch`) and frontend (Vite) under one supervisor with `[api]`/`[web]` prefixes. All process ids are written to `.dev/session.json`.
4. **Stop:** Ctrl+C, closing the terminal, or either server crashing stops **both whole process trees** (Windows `taskkill /T`, POSIX process groups) and removes the session file.

Ports are fixed (5173, 3000) — Keycloak redirect URIs depend on them — so the tooling never switches ports silently.

Flags: `npm run dev -- --allow-db-offline` (start even if Neon is unreachable; sign-in returns 503), `--skip-deps-check`.

## Commands

| Command                                   | What it does                                                                                                                          | Changes anything?                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev:doctor`                      | Full diagnosis: Node, `.env`, dev session, Docker, containers, port owners, Redis, Keycloak, Neon pooled + direct, HTTPS reachability | No                                                                                 |
| `npm run dev:deps`                        | `docker compose -p educomply up -d --wait redis keycloak` (checks for foreign containers on 6379/8080 first)                          | Starts this project's containers                                                   |
| `npm run dev:deps:stop`                   | `docker compose -p educomply --profile app stop`                                                                                      | Stops this project's containers only (incl. the Docker app); volumes kept          |
| `npm run dev`                             | Preflight + start                                                                                                                     | Stops **only** verified orphans of a previous `npm run dev`                        |
| `npm run dev:stop`                        | Stops the processes recorded by `npm run dev`                                                                                         | Only EduComply-owned processes                                                     |
| `npm run dev:stop -- --include-unmanaged` | Also stops EduComply dev servers started another way (e.g. a second terminal)                                                         | Only processes whose command line is this repo's Vite/tsx — your explicit approval |
| `npm run dev:health`                      | `/api/v1/health`, `/api/v1/ready`, frontend and frontend→API proxy (works for `npm run dev` and the Docker stack)                     | No                                                                                 |
| `npm run docker:up`                       | Preflight (Docker, `.env`, ports), then `docker compose -p educomply --profile app up -d --build --wait`                              | Builds and starts this project's containers; refuses while `npm run dev` runs      |
| `npm run docker:stop`                     | `docker compose -p educomply --profile app stop frontend backend`                                                                     | Stops the app containers only; Redis, Keycloak and volumes kept                    |

## Port conflicts — what the tooling does

| Who holds 5173 / 3000                                                                                | Detection                     | Action                                                                   |
| ---------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| Orphan of a previous `npm run dev` (session file + command line both match, supervisor dead)         | automatic                     | Stopped automatically, then the port is re-checked                       |
| A running `npm run dev`                                                                              | session file                  | Refuses; use that terminal or `npm run dev:stop`                         |
| EduComply Vite/tsx started outside `npm run dev` (e.g. `npm run dev -w backend` in another terminal) | repo path in the command line | Refuses; you approve with `npm run dev:stop -- --include-unmanaged`      |
| The EduComply Docker stack (`npm run docker:up`)                                                     | compose project `educomply`   | Refuses; use the stack, or `npm run docker:stop` first                   |
| Another project's Docker container (e.g. `habit-tracker-frontend`)                                   | `docker ps` published ports   | Refuses; shows the container and `docker stop <name>` for **you** to run |
| Any other application                                                                                | listener pid                  | Refuses; never stopped by the tooling                                    |

Why connecting matters: Vite binds `localhost` to **::1 only** on Windows, while Docker publishes **0.0.0.0** (IPv4). Both can hold "5173" at the same time and browser traffic splits between them; non-elevated `netstat`/`Get-NetTCPConnection` do not even list Vite's IPv6 listener. The tooling therefore probes 127.0.0.1 **and** ::1 by connecting.

## Docker

### Two ways to run the app (one at a time)

|                 | `npm run dev`                           | `npm run docker:up`                              |
| --------------- | --------------------------------------- | ------------------------------------------------ |
| Frontend        | Vite dev server (hot reload) on 5173    | nginx serving the production build on 5173       |
| Backend         | `tsx watch` on 3000                     | compiled `node dist/server.js` container on 3000 |
| Redis, Keycloak | Docker (`npm run dev:deps`)             | Docker (started automatically)                   |
| Database        | Neon (`DATABASE_TRANSPORT` from `.env`) | Neon (`DATABASE_TRANSPORT` from `.env`)          |
| Best for        | development                             | a production-like local run, the demo fallback   |

Both use **http://localhost:5173**, because the Keycloak redirect URI is registered for that port. Switching:

```bash
# npm run dev → Docker
Ctrl+C in the npm run dev terminal     (or: npm run dev:stop -- --include-unmanaged)
npm run docker:up

# Docker → npm run dev
npm run docker:stop
npm run dev
```

Each command refuses (and explains why) while the other mode holds 5173/3000. Signed-in sessions survive the switch, because both modes use the same Redis.

**Keycloak inside Docker.** Keycloak always issues tokens for `http://localhost:8080/realms/educomply` (fixed `KC_HOSTNAME`), the URL the browser uses. Inside the backend container `localhost` is the container itself, so Compose sets `OIDC_INTERNAL_URL=http://keycloak:8080`: server-to-server requests (discovery, token exchange, keys, logout) go to the `keycloak` service, while the issuer, audience and signature checks still use the public issuer.

### Containers and volumes

- `docker-compose.yml` has an explicit project name (`educomply`), no global `container_name`, ports bound to `127.0.0.1`, and health checks for Redis (`redis-cli ping`) and Keycloak (`/health/ready`).
- All commands pass `-p educomply`, so they never stop another project's containers. Volumes are never removed (only `npm run keycloak:reset`, which you run deliberately, deletes the Keycloak volume).
- The backend and frontend images are built from the repository root (one npm lockfile). They contain no `.env`, run as non-root users, and the backend image only holds production dependencies plus the compiled code.
- Another project on our ports: `docker ps --filter publish=5173` (or 3000/6379/8080) shows it; stop just that container with `docker stop <name>`; restart it later with `docker start <name>`.

## Neon connectivity

The app can reach Neon in two ways, selected with `DATABASE_TRANSPORT` in `.env`:

| `DATABASE_TRANSPORT` | Adapter                                                              | Network path                                                         | TLS                                                                                                           |
| -------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `tcp` (default)      | `@prisma/adapter-pg`                                                 | PostgreSQL protocol, TCP **5432**                                    | `sslmode=verify-full` enforced for `pg` (certificate + host name verified)                                    |
| `websocket`          | `@prisma/adapter-neon` (`PrismaNeon`, Neon serverless driver `Pool`) | PostgreSQL protocol tunnelled through `wss://<host>/v2`, TCP **443** | `wss://` certificate verified by Node's built-in WebSocket; driver defaults kept (`useSecureWebSocket: true`) |

Both use the same pooled `DATABASE_URL`, Neon credentials, schema, data and pool limits, and both support
Prisma interactive transactions (user sync, role changes and audit events). Neon's HTTP-only mode
(`PrismaNeonHttp`) is **not** used: it cannot run interactive transactions.

**Migrations always use `DIRECT_URL` over TCP 5432** (`prisma.config.ts`). On a network that blocks
5432, `db:migrate:*` fails — run migrations from a network that allows it (e.g. a phone hotspot).

`npm run dev:doctor` tests **both** transports with a real `SELECT 1` (an HTTPS reachability check is
not taken as proof that WebSockets work) and recommends switching when only the other one works:

```
✖ Neon app DB over TCP 5432 ← used by the app: tcp_timeout …
✔ Neon app DB over WebSocket 443: connected via WebSocket (wss, 443), TLS verified …
! Recommendation: this network blocks the configured transport (tcp) but websocket works
    → Set DATABASE_TRANSPORT=websocket in .env and restart npm run dev.
```

`npm run dev` checks only the configured transport.

| Diagnosis                          | Meaning                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `dns_error`                        | Host name not resolvable (no internet / DNS)                                                   |
| `tcp_timeout` / `tcp_refused`      | Port 5432 blocked or host wrong                                                                |
| `ssl_stalled`                      | TCP opens but the PostgreSQL TLS request is never answered → a firewall/proxy intercepts 5432  |
| `tls_failed`                       | Certificate verification failed (proxy MITM or wrong clock)                                    |
| `ws_failed`                        | WebSocket to `wss://…/v2` (443) could not be opened: blocked, refused, or certificate rejected |
| `auth_failed` / `database_missing` | Credentials / database name in `.env`                                                          |
| `compute_unavailable`              | Neon endpoint disabled, suspended or over quota                                                |
| `query_timeout`                    | Connected but slow (cold start) — retry                                                        |

Runtime safeguards (both transports): connection timeout 15 s, per-query cap 30 s, Prisma transaction
wait 15 s / run 20 s, readiness probe 5 s, TCP keep-alive for `tcp`. Connection failures (refused,
timed out, lost, failed WebSocket) return a sanitized `503` with a code such as `DB_CONNECT_TIMEOUT` or
`DB_WEBSOCKET_FAILED`; responses and readiness never include connection details.

**If the database is unreachable:**

1. Run `npm run dev:doctor`. If it recommends `DATABASE_TRANSPORT=websocket`, set it in `.env` and restart `npm run dev`.
2. If neither transport works, use another network (phone hotspot / home Wi-Fi).
3. Ask IT to allow outbound TCP 5432 (or WebSocket upgrades on 443) to `*.neon.tech`.

The application is **not** offline-capable: sign-in and user pages need Neon, Redis and Keycloak.
No local database fallback exists.

## Demo runbook (Sprint 1 evaluation)

**Day before:** on the evaluation network run `npm run dev:doctor`. If it recommends `DATABASE_TRANSPORT=websocket`, set it in `.env` and run the doctor again. If neither transport works there, plan to use a phone hotspot. Run any pending migrations beforehand from a network that allows 5432.

**Start with `npm run dev` (≈2 minutes):**

```bash
# 1. Docker Desktop running ("Engine running")
npm run dev:deps            # Redis + Keycloak healthy
npm run dev:doctor          # all ✔ (fix anything marked ✖ first)
npm run dev                 # starts both servers; leave this terminal open
# 2. In a second terminal:
npm run dev:health          # liveness, readiness (DB + Redis), frontend and proxy all ✔
```

**Or start in Docker** (production build; use this if `npm run dev` misbehaves):

```bash
npm run docker:up           # builds on the first run (several minutes), then starts in about a minute
npm run dev:health
```

**Walkthrough:** http://localhost:5173 → **Sign in** → learner `learner1` (Keycloak) → dashboard shows your name; open a protected page; **Log out**. Then sign in as an administrator (the account must have signed in once and been granted ADMIN beforehand: `npm run db:grant-role -- --email <admin email> --role ADMIN --reason "Sprint 1 demo"`): Sign in lands on `/admin/dashboard` with the admin menu, and **User Management** lists real users. A learner opening `/admin` sees "You don't have access".

**Redis sessions:** after signing in, `npm run dev:health` → readiness `redis: up`; sign-out clears the `ec_session` cookie.

**If the network blocks Neon during the demo:** set `DATABASE_TRANSPORT=websocket` (if the doctor shows WebSocket ✔) and restart `npm run dev`; otherwise switch the laptop to the hotspot, wait for `npm run dev:doctor` to show Neon ✔ (no restart needed; readiness recovers automatically). Authentication, roles and TLS are unchanged — there is no bypass mode.

**Stop:** Ctrl+C in the `npm run dev` terminal (or `npm run docker:stop`), then optionally `npm run dev:deps:stop`.

## Continuous integration

GitHub Actions ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs four jobs: `quality` (format, lint, Prisma validation, typecheck, builds, unit tests), `secrets` (no tracked `.env`, Gitleaks over the full history), `docker` (Compose validation, image builds) and `integration`. The integration job uses a temporary PostgreSQL service and this repository's Redis/Keycloak Compose services with a throwaway `.env` (random secrets, never printed). It runs migrations and seed, the live Redis/DB/Keycloak/e2e suites and a Docker stack smoke test. No repository secrets are used and the real Neon database is never contacted. Before pushing, `npm run check` runs the same quality checks locally.

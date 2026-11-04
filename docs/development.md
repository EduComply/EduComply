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
| `npm run dev:deps:stop`                   | `docker compose -p educomply stop`                                                                                                    | Stops this project's containers only; volumes kept                                 |
| `npm run dev`                             | Preflight + start                                                                                                                     | Stops **only** verified orphans of a previous `npm run dev`                        |
| `npm run dev:stop`                        | Stops the processes recorded by `npm run dev`                                                                                         | Only EduComply-owned processes                                                     |
| `npm run dev:stop -- --include-unmanaged` | Also stops EduComply dev servers started another way (e.g. a second terminal)                                                         | Only processes whose command line is this repo's Vite/tsx — your explicit approval |
| `npm run dev:health`                      | `/api/v1/health`, `/api/v1/ready`, frontend and frontend→API proxy                                                                    | No                                                                                 |

## Port conflicts — what the tooling does

| Who holds 5173 / 3000                                                                                | Detection                     | Action                                                                   |
| ---------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| Orphan of a previous `npm run dev` (session file + command line both match, supervisor dead)         | automatic                     | Stopped automatically, then the port is re-checked                       |
| A running `npm run dev`                                                                              | session file                  | Refuses; use that terminal or `npm run dev:stop`                         |
| EduComply Vite/tsx started outside `npm run dev` (e.g. `npm run dev -w backend` in another terminal) | repo path in the command line | Refuses; you approve with `npm run dev:stop -- --include-unmanaged`      |
| Another project's Docker container (e.g. `habit-tracker-frontend`)                                   | `docker ps` published ports   | Refuses; shows the container and `docker stop <name>` for **you** to run |
| Any other application                                                                                | listener pid                  | Refuses; never stopped by the tooling                                    |

Why connecting matters: Vite binds `localhost` to **::1 only** on Windows, while Docker publishes **0.0.0.0** (IPv4). Both can hold "5173" at the same time and browser traffic splits between them; non-elevated `netstat`/`Get-NetTCPConnection` do not even list Vite's IPv6 listener. The tooling therefore probes 127.0.0.1 **and** ::1 by connecting.

## Docker

- `docker-compose.yml` has an explicit project name (`educomply`), no global `container_name`, ports bound to `127.0.0.1`, and health checks for Redis (`redis-cli ping`) and Keycloak (`/health/ready`).
- All commands pass `-p educomply`, so they never stop another project's containers. Volumes are never removed (only `npm run keycloak:reset`, which you run deliberately, deletes the Keycloak volume).
- Another project on our ports: `docker ps --filter publish=5173` (or 3000/6379/8080) shows it; stop just that container with `docker stop <name>`; restart it later with `docker start <name>`.

## Neon connectivity

The app connects to Neon over PostgreSQL (TCP **5432**) with TLS (`sslmode=require`; the `pg` driver verifies the certificate — never disable it). Some networks (campus/office Wi-Fi) block or intercept 5432.

`npm run dev:doctor` distinguishes:

| Diagnosis                          | Meaning                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `dns_error`                        | Host name not resolvable (no internet / DNS)                                                  |
| `tcp_timeout` / `tcp_refused`      | Port 5432 blocked or host wrong                                                               |
| `ssl_stalled`                      | TCP opens but the PostgreSQL TLS request is never answered → a firewall/proxy intercepts 5432 |
| `tls_failed`                       | Certificate verification failed (proxy MITM or wrong clock)                                   |
| `auth_failed` / `database_missing` | Credentials / database name in `.env`                                                         |
| `compute_unavailable`              | Neon endpoint disabled, suspended or over quota                                               |
| `query_timeout`                    | Connected but slow (cold start) — retry                                                       |

Runtime safeguards: connection timeout 10 s, per-query cap 30 s, TCP keep-alive, Prisma transaction wait 10 s / run 20 s (the old 2 s default caused "Unable to start a transaction in the given time" on cold starts), readiness probe 5 s. Database outages return sanitized `503` responses; error messages never include connection details.

**If 5432 is blocked** (doctor shows `ssl_stalled`/`tcp_timeout` and "Neon over HTTPS (443): reachable"):

1. **Use another network** (phone hotspot / home Wi-Fi). Works today, no code change. Required for `db:migrate:*` in any case.
2. **Ask IT** to allow outbound TCP 5432 to `*.neon.tech`.
3. _(Needs approval — architecture change)_ Neon's serverless driver over **WebSockets/HTTPS (443)** via `@prisma/adapter-neon` for runtime queries. Keeps TLS and Neon auth; migrations would still need 5432 from another network.
4. _(Needs approval)_ A local PostgreSQL container as a separate demo database (migrate + seed; users sign in again). Fully offline-capable for the database, but it is a different dataset.

The application is **not** offline-capable today: sign-in and user pages need Neon, Redis and Keycloak.

## Demo runbook (Sprint 1 evaluation)

**Day before:** on the evaluation network run `npm run dev:doctor`. If Neon shows `ssl_stalled`/`tcp_timeout`, plan to use a phone hotspot.

**Start (≈2 minutes):**

```bash
# 1. Docker Desktop running ("Engine running")
npm run dev:deps            # Redis + Keycloak healthy
npm run dev:doctor          # all ✔ (fix anything marked ✖ first)
npm run dev                 # starts both servers; leave this terminal open
# 2. In a second terminal:
npm run dev:health          # liveness, readiness (DB + Redis), frontend and proxy all ✔
```

**Walkthrough:** http://localhost:5173 → **Sign in** → learner `learner1` (Keycloak) → dashboard shows your name; open a protected page; **Log out**. Then sign in as an administrator (`npm run db:grant-role -- --email <admin email> --role ADMIN --reason "Sprint 1 demo"` beforehand) → `/admin/users` lists real users. A learner opening `/admin` sees "You don't have access".

**Redis sessions:** after signing in, `npm run dev:health` → readiness `redis: up`; sign-out clears the `ec_session` cookie.

**If the network blocks Neon during the demo:** switch the laptop to the hotspot, wait for `npm run dev:doctor` to show Neon ✔ (no restart needed; readiness recovers automatically). Authentication, roles and TLS are unchanged — there is no bypass mode.

**Stop:** Ctrl+C in the `npm run dev` terminal, then optionally `npm run dev:deps:stop`.

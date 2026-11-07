# Sprint 1 — implementation and documentation alignment

Scope: only what Sprint 1 built (authentication and foundation). Later-sprint features in the
documents are **planned**, not defects. Sources: Full Project Proposal v1.1, the earlier proposal,
Architecture V2.1 (Diagrams A and B), Initial API Design v0.1, ER Diagram, and the API contract
[`docs/openapi.yaml`](openapi.yaml) (unchanged copy of the canonical file; 87 operations, 69 paths).

Classification: **Aligned** · **Code defect (fixed)** · **Deliberate choice** (documented) ·
**Decision needed** (team/client) · **Planned** (later sprint).

## 1. What Sprint 1 implements

| Area            | Implemented (real)                                                                                                                                            | Demonstration / placeholder                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in         | OIDC authorization code + PKCE, state, nonce via Keycloak; backend-for-frontend session; logout incl. Keycloak logout                                         | —                                                                                                                                   |
| Sessions        | Redis, opaque HttpOnly cookie, 8 h idle timeout, CSRF token on state-changing requests, session replaced at login                                             | —                                                                                                                                   |
| Users and roles | LEARNER / ADMIN / REVIEWER in PostgreSQL; new users LEARNER; audited role changes (API and `db:grant-role`); server-side role checks; role-based landing page | —                                                                                                                                   |
| Audit           | Append-only `audit_event` (DB triggers), same transaction as the change, admin Audit Events page                                                              | —                                                                                                                                   |
| Health          | `GET /health`, `GET /ready` (PostgreSQL + Redis)                                                                                                              | —                                                                                                                                   |
| Learner portal  | Shell, navigation, profile (real user)                                                                                                                        | Dashboard, My Training, Assessments, Progress, Calendar (labelled sample data; demo quiz scored in the browser); Settings not saved |
| Admin portal    | Dashboard figures, User Management, Learner Management, Audit Events, Profile                                                                                 | Courses, Videos, Question Banks, Monitoring, Certificates, Reports ("arrives in Sprint N")                                          |
| DevOps          | Docker images + Compose (Redis, Keycloak, backend, frontend), GitHub Actions (quality, secret scan, Docker, integration)                                      | —                                                                                                                                   |

## 2. Alignment register

| #   | Item                                                                                                                                       | Document                                                                                         | Classification              | Handling                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | React + TS + Vite; Node + TS + Express; modular monolith                                                                                   | Proposal §9, V2.1                                                                                | Aligned                     | —                                                                                                                                                                  |
| 2   | Clean Architecture: `users/application/grantRole.ts` imported Prisma and infrastructure                                                    | API design §2, V2.1 B                                                                            | Code defect (fixed)         | Moved to `users/infrastructure/grantRole.ts` (it is a Prisma transaction script); no behaviour change                                                              |
| 3   | Last-administrator check used an unlocked `COUNT`; two concurrent demotions removed every admin (reproduced 20/20 on a throwaway database) | Role administration (API design §4, README)                                                      | Code defect (fixed)         | `prismaUserAdmin.ts` locks active ADMIN rows `FOR UPDATE` (fixed order) before checking; re-test 20/20 kept one admin                                              |
| 4   | Audit IPs hashed with unsalted SHA-256 (reversible for IPv4)                                                                               | API design §9 "hashed IP"; Proposal §14 privacy                                                  | Code defect (fixed)         | HMAC-SHA-256 with `AUDIT_IP_HASH_KEY` (required in production, optional in development); same `char(64)` column, no migration. Existing rows keep their old values |
| 5   | Audit table append-only via trigger; API design asks for an insert-only **database role**                                                  | API design §9                                                                                    | Decision needed (DB change) | See §5 — needs approval; not applied                                                                                                                               |
| 6   | REVIEWER can read the audit log and reports; API design: REVIEWER = monitoring flags only, audit for AUDITOR                               | API design §4, contract `x-roles`                                                                | Decision needed             | Open client question (API design §11 Q3); current behaviour kept. No REVIEWER users exist                                                                          |
| 7   | Session lifetime: 8 h idle (as designed); no absolute maximum                                                                              | API design §4                                                                                    | Deliberate (no requirement) | Recommendation: add an absolute lifetime when the client sets a policy                                                                                             |
| 8   | General rate limit fails open if Redis is down; `/auth/*` fails closed                                                                     | API design §4 (limits only)                                                                      | Deliberate choice           | Availability for signed-in users; sessions themselves fail closed (503)                                                                                            |
| 9   | PostgreSQL authoritative; Redis only sessions, rate limits, OIDC login state (all with expiry)                                             | V2.1 C2                                                                                          | Aligned                     | V2.1 B lists "login sessions" under PostgreSQL; API design puts sessions in Redis — implementation follows the API design (no compliance evidence in Redis)        |
| 10  | Roles assigned by EduComply, never from IdP claims                                                                                         | V2.1 B ("EduComply decides permissions") vs API design §4 ("maps institutional groups to roles") | Deliberate choice           | Follows V2.1 (newer, safer)                                                                                                                                        |
| 11  | One role per user                                                                                                                          | ER `USER.role_id` vs contract `roles: array`                                                     | Deliberate choice           | Follows the ER; API keeps the `roles` array shape with exactly one entry                                                                                           |
| 12  | `PATCH /me/preferences` missing                                                                                                            | Contract (Users module, Sprint 1 in API design §2)                                               | Planned                     | Not added (no stored preferences yet); Settings page says preferences are not saved                                                                                |
| 13  | SAML endpoints (`/auth/saml/*`) missing                                                                                                    | Contract; API design §11 next steps (Sprint 6)                                                   | Planned                     | —                                                                                                                                                                  |
| 14  | ER entities beyond User & Authentication                                                                                                   | ER, V2.1                                                                                         | Planned                     | Not created                                                                                                                                                        |

## 3. API contract differences (Sprint 1 endpoints)

Implemented: `GET /auth/login`, `GET /auth/oidc/callback`, `POST /auth/logout`, `GET /me`,
`GET /users`, `GET /users/{userId}`, `PATCH /users/{userId}/roles`, `GET /audit-events`,
`GET /health`, `GET /ready` (+ alias `GET /health/ready`). All use RFC 9457 problems with the
contract's codes, `X-Request-Id`, strict Zod validation and CSRF on state-changing requests.

| Endpoint                      | Difference                                                                                                                                                  | Classification                  | Proposed contract correction                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /auth/login`             | `idp` query parameter not accepted (single identity provider)                                                                                               | Deliberate                      | Mark `idp` "only when several providers are configured"                              |
| `GET /auth/oidc/callback`     | Errors redirect to `/?authError=<CODE>` (302) instead of `400`                                                                                              | Deliberate (browser navigation) | Document the 302 error redirect                                                      |
| `GET /me`                     | No `preferences` / `monitoringNoticeAcceptedVersion` (not stored yet); extra `portals`, `homePath`, `userType`, `department`, `institutionalId`, `isActive` | Deliberate / Planned            | Add the extra fields; mark the missing ones as later sprints                         |
| `GET /users`                  | `group` and `sort` not supported (400 if sent)                                                                                                              | Planned                         | Mark as later (no groups in Sprint 1)                                                |
| `GET /users/{userId}`         | No `enrolments` summary                                                                                                                                     | Planned                         | —                                                                                    |
| `PATCH /users/{userId}/roles` | Exactly one role (`maxItems: 1`); cannot change own role; last ADMIN protected; audit action `user.role_changed` (contract `USER_ROLES_CHANGED`)            | Deliberate                      | Add `maxItems: 1`, the 409/422 rules, and the dot-style action names used throughout |
| `GET /audit-events`           | Roles ADMIN + REVIEWER (contract ADMIN + AUDITOR); item has `metadata` (not `before`/`after`), no `actorRole`; `id` is a numeric string                     | Decision needed / Deliberate    | After the role decision, align `x-roles`; document `metadata` and the numeric id     |
| `GET /ready`                  | Checks PostgreSQL and Redis; S3 not yet present                                                                                                             | Planned                         | —                                                                                    |

The contract file itself is unchanged; corrections above are proposals for the team's next
contract pull request.

## 4. Database (Sprint 1 tables)

`role`, `user`, `user_identity` match the ER "User & Authentication" group field for field
(types, sizes, nullability, `UNIQUE(issuer, subject)`, cascade from user to identities, restrict on
role). `audit_event` comes from API design §9 (not in the ER): append-only by trigger, actor FK
restrict, indexes for actor, target, action and time. **No schema change was needed** for this
alignment (the keyed IP hash keeps the `char(64)` column).

## 5. Approval requests and open decisions

1. **Insert-only database role for the audit log (item 5).** Proposed, not applied (changes the shared Neon database):
   create an application role without DDL rights, `GRANT SELECT, INSERT ON audit_event`,
   `GRANT USAGE ON SEQUENCE audit_event_id_seq`, normal DML on the other tables, and use it in
   `DATABASE_URL` while `DIRECT_URL` (migrations) keeps the owner role. Impact: new Neon role and
   connection string; no data change.
2. **REVIEWER vs AUDITOR (item 6)** — client decision (API design §11 Q3).
3. **Absolute session lifetime (item 7)** — client security policy.
4. **`AUDIT_IP_HASH_KEY`** — add a 32+ character secret to production configuration (required at
   start-up when `NODE_ENV=production`); optional locally.

## 6. Document conflicts (for the next design review)

| Topic            | Conflict                                                                                                       | Recommendation for Sprint 1                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Roles            | FR01 learner/administrator; API design adds REVIEWER, AUDITOR; code has three roles                            | Keep three roles until the client answers Q3                  |
| Role source      | API design maps IdP groups to roles; V2.1 says EduComply decides                                               | Follow V2.1 (current code)                                    |
| Roles per user   | ER one role; contract array                                                                                    | Keep one role; contract `maxItems: 1`                         |
| Session storage  | V2.1 B: login sessions in PostgreSQL; API design: Redis                                                        | Keep Redis (temporary, no evidence); revisit with V2.1 owners |
| Later data model | ER (no course versions, question banks, flags, outbox; one certificate per enrolment) vs V2.1 and the proposal | Resolve before Sprint 2 schema work; not a Sprint 1 issue     |

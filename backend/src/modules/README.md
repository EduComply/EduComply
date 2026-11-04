# Backend modules

The API is a **modular monolith**: one deployable Express app, with each business capability in its own module under `src/modules/<module>/`.

```
<module>/
  domain/          entities and pure business rules (no Express, Prisma or Redis imports)
  application/     use cases; define ports (interfaces) for what they need
  infrastructure/  adapters implementing ports (Prisma, Redis, S3, OIDC client)
  presentation/    Express router, request validation (Zod), HTTP mapping
```

Dependencies point inwards only: `presentation → application → domain`. `infrastructure` implements ports from `application`. Modules talk to each other through application-layer functions, never by reaching into another module's infrastructure or database tables.

Shared cross-cutting code lives in `src/shared/` (logger, HTTP errors, Prisma client in `shared/infrastructure/database`, later: auth middleware).

Repositories take a `DbClient` (Prisma client **or** transaction client) so a use case can write a change and its audit event in one transaction.

## Module map

| Module          | Base path (`/api/v1`)           | Sprint (proposal v1.1) | Status          |
| --------------- | ------------------------------- | ---------------------- | --------------- |
| `health`        | `/health`                       | 1                      | Implemented     |
| `auth`          | `/auth/*`, `/me`                | 1                      | Next: auth-oidc |
| `users`         | `/users`                        | 1                      | Data layer done |
| `audit`         | `/audit-events`                 | 1                      | Data layer done |
| `courses`       | `/courses`, `/course-versions`  | 2                      | Planned         |
| `question-bank` | `/question-banks`               | 2                      | Planned         |
| `enrolments`    | `/enrolments`, `/me/enrolments` | 2                      | Planned         |
| `playback`      | `/playback-sessions`            | 3                      | Planned         |
| `assessments`   | `/assessments`, `/attempts`     | 4                      | Planned         |
| `monitoring`    | `/monitoring-events`, `/flags`  | 5                      | Planned         |
| `certificates`  | `/certificates`, `/verify`      | 5                      | Planned         |
| `reports`       | `/reports`                      | 6                      | Planned         |

Create a module folder only when its first feature is implemented. Register its router in `src/app.ts`.

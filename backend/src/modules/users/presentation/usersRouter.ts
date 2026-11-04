import { Router } from 'express';
import { z } from 'zod';
import { Errors } from '../../../shared/http/problem.js';
import { validate, validated } from '../../../shared/http/validate.js';
import type { AuthUser } from '../../auth/application/ports.js';
import type { AuthGuards } from '../../auth/presentation/authGuards.js';
import { UserAdminError, type UserAdminService } from '../application/userAdmin.js';
import { ROLE_NAMES } from '../domain/roles.js';

/** User DTO (camelCase, ISO timestamps). `roles` is an array per the API contract; one role per user (ER). */
export function userView(user: AuthUser) {
  return {
    id: user.id,
    displayName: user.fullName,
    email: user.email,
    roles: [user.role],
    userType: user.userType,
    department: user.department,
    institutionalId: user.institutionalId,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

const Role = z.enum(ROLE_NAMES);
const UserIdParams = z.strictObject({ userId: z.uuid() });
const ListQuery = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  role: Role.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});
const RolesBody = z.strictObject({
  roles: z.array(Role).length(1, 'Exactly one role: each user has a single role'),
  reason: z.string().trim().min(5).max(500),
});

export function usersRouter(deps: { guards: AuthGuards; admin: UserAdminService }): Router {
  const router = Router();
  const { authenticated, requireRole } = deps.guards;

  /** GET /me — current user, roles and CSRF token (any signed-in user). */
  router.get('/me', ...authenticated, (req, res) => {
    const auth = req.auth!;
    res.set('Cache-Control', 'no-store').json({
      ...userView(auth.user),
      csrfToken: auth.session.csrfToken,
    });
  });

  /** GET /users — search users (ADMIN). */
  router.get(
    '/users',
    ...authenticated,
    requireRole('ADMIN'),
    validate({ query: ListQuery }),
    async (req, res) => {
      const query = validated<z.infer<typeof ListQuery>>(req, 'query');
      const page = await deps.admin.list(query);
      res.json({ data: page.data.map(userView), page: page.page });
    },
  );

  /** GET /users/{userId} — user detail (ADMIN). */
  router.get(
    '/users/:userId',
    ...authenticated,
    requireRole('ADMIN'),
    validate({ params: UserIdParams }),
    async (req, res) => {
      const { userId } = validated<z.infer<typeof UserIdParams>>(req, 'params');
      const user = await deps.admin.get(userId);
      if (!user) throw Errors.notFound('User not found.');
      res.json(userView(user));
    },
  );

  /** PATCH /users/{userId}/roles — change a user's role (ADMIN, CSRF, audited). */
  router.patch(
    '/users/:userId/roles',
    ...authenticated,
    requireRole('ADMIN'),
    validate({ params: UserIdParams, body: RolesBody }),
    async (req, res) => {
      const { userId } = validated<z.infer<typeof UserIdParams>>(req, 'params');
      const body = validated<z.infer<typeof RolesBody>>(req, 'body');
      try {
        const user = await deps.admin.changeRole({
          actor: req.auth!.user,
          userId,
          role: body.roles[0]!,
          reason: body.reason,
          ctx: {
            ...(typeof req.id === 'string' ? { requestId: req.id } : {}),
            ...(req.ip ? { ip: req.ip } : {}),
          },
        });
        res.json(userView(user));
      } catch (err) {
        if (!(err instanceof UserAdminError)) throw err;
        if (err.reason === 'NOT_FOUND') throw Errors.notFound('User not found.');
        if (err.reason === 'SELF_CHANGE') {
          throw Errors.conflict('SELF_ROLE_CHANGE', 'Administrators cannot change their own role.');
        }
        throw Errors.conflict('LAST_ADMIN', 'The last active administrator cannot be demoted.');
      }
    },
  );

  return router;
}

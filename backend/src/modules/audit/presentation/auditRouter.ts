import { Router } from 'express';
import { z } from 'zod';
import { validate, validated } from '../../../shared/http/validate.js';
import type { AuthGuards } from '../../auth/presentation/authGuards.js';
import type { AuditQueryService } from '../application/auditQuery.js';

const AuditQuery = z.strictObject({
  actorId: z.uuid().optional(),
  action: z.string().max(100).optional(),
  targetType: z.string().max(50).optional(),
  targetId: z.string().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().regex(/^\d+$/).optional(),
});

/**
 * GET /audit-events — read the append-only audit log. The API design grants this to
 * Admin and the (optional) Auditor; EduComply's REVIEWER role covers "reports and audit".
 */
export function auditRouter(deps: { guards: AuthGuards; audit: AuditQueryService }): Router {
  const router = Router();
  router.get(
    '/audit-events',
    ...deps.guards.authenticated,
    deps.guards.requireRole('ADMIN', 'REVIEWER'),
    validate({ query: AuditQuery }),
    async (req, res) => {
      const page = await deps.audit.list(validated<z.infer<typeof AuditQuery>>(req, 'query'));
      res.set('Cache-Control', 'no-store').json(page);
    },
  );
  return router;
}

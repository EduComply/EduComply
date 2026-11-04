import { Router } from 'express';
import { healthController, type HealthControllerDeps } from './healthController.js';

/**
 * Mounted at the API root. Paths follow the Initial API Design endpoint catalogue:
 *   GET /health  liveness
 *   GET /ready   readiness (PostgreSQL, Redis)
 * GET /health/ready is kept as an alias of /ready (added in Task 2).
 */
export function healthRouter(deps: HealthControllerDeps): Router {
  const controller = healthController(deps);
  const router = Router();
  router.get('/health', controller.liveness);
  router.get('/ready', controller.readiness);
  router.get('/health/ready', controller.readiness);
  return router;
}

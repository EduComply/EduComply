import { Router } from 'express';
import { checkDatabase } from '../../../shared/infrastructure/database/prisma.js';
import { getHealth } from '../application/getHealth.js';

export function healthRouter(version: string): Router {
  const router = Router();

  // Liveness: the process is running.
  router.get('/', (_req, res) => {
    res.json(getHealth(version));
  });

  // Readiness: dependencies are reachable. 503 when the database is down or not configured.
  router.get('/ready', async (_req, res) => {
    const database = await checkDatabase();
    const ready = database.status === 'up';
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', database });
  });

  return router;
}

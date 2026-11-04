import { Router } from 'express';
import { getHealth } from '../application/getHealth.js';

export function healthRouter(version: string): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json(getHealth(version));
  });
  return router;
}

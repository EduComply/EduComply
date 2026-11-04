import cors from 'cors';
import type { RequestHandler } from 'express';

/**
 * CORS with an explicit allow-list (exact origin match). Requests from other origins
 * receive no CORS headers, so browsers block them. Requests without an Origin header
 * (same-origin, curl, server-to-server) are unaffected.
 *
 * In development the Vite proxy keeps the portal same-origin; the allow-list matters
 * when the portal and API are served from different origins.
 */
export function corsMiddleware(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return cors({
    origin(origin, callback) {
      callback(null, origin === undefined || allowed.has(origin));
    },
    credentials: true, // session cookie (Task 4)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id', 'Idempotency-Key', 'If-Match'],
    exposedHeaders: [
      'X-Request-Id',
      'ETag',
      'Location',
      'Retry-After',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
    ],
    maxAge: 600,
  });
}

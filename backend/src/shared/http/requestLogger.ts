import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Accept caller-supplied IDs (e.g. from a proxy) only if they are short and safe to log. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** Returns the incoming request id if it is safe, otherwise a new UUID. */
export function resolveRequestId(incoming: string | string[] | undefined): string {
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value && SAFE_REQUEST_ID.test(value) ? value : randomUUID();
}

/** Paths polled by load balancers; logged only when they fail. */
const PROBE_PATHS = new Set(['/api/v1/health', '/api/v1/ready', '/api/v1/health/ready']);

/**
 * Assigns every request an id (req.id), returns it in X-Request-Id on every response
 * (API Design §3) and writes structured JSON access logs that include it.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId(req: IncomingMessage, res: ServerResponse) {
      const id = resolveRequestId(req.headers['x-request-id']);
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    customAttributeKeys: { reqId: 'requestId' },
    autoLogging: {
      ignore: (req) => PROBE_PATHS.has((req.url ?? '').split('?')[0] ?? ''),
    },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      // Log method, path and status only — never query strings, bodies or headers.
      req: (req: { method?: string; url?: string; id?: unknown }) => ({
        id: req.id,
        method: req.method,
        path: (req.url ?? '').split('?')[0],
      }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
  }) as RequestHandler;
}

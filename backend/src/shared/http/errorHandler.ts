import type { ErrorRequestHandler, Request, RequestHandler } from 'express';
import { logger as rootLogger } from '../logger.js';
import { databaseErrorCode, toHttpError } from '../infrastructure/database/errors.js';
import { Errors, HttpError } from './problem.js';

const PROBLEM_JSON = 'application/problem+json';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(Errors.notFound(`No route matches ${req.method} ${req.path}`));
};

/** body-parser errors carry a `type`; map them to contract errors. */
function fromBodyParser(err: unknown): HttpError | undefined {
  const type = (err as { type?: unknown } | null)?.type;
  switch (type) {
    case 'entity.parse.failed':
      return Errors.validation([{ path: 'body', message: 'Malformed JSON' }], 'Malformed JSON.');
    case 'entity.too.large':
      return Errors.payloadTooLarge();
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return Errors.unsupportedMediaType();
    default:
      return undefined;
  }
}

function requestLog(req: Request) {
  return (req as { log?: typeof rootLogger }).log ?? rootLogger;
}

/**
 * Central error handler: every error becomes an RFC 9457 problem with code and requestId.
 * Unexpected errors return a generic 500; details stay in the server log only.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  let httpError: HttpError;
  if (err instanceof HttpError) {
    httpError = err;
  } else if (fromBodyParser(err)) {
    httpError = fromBodyParser(err)!;
  } else if (toHttpError(err)) {
    httpError = toHttpError(err)!;
    // Database errors: log the code only (messages can contain hosts or values).
    requestLog(req).warn(
      { dbCode: databaseErrorCode(err), status: httpError.status },
      'Database error',
    );
  } else {
    httpError = Errors.internal();
    requestLog(req).error({ err }, 'Unhandled error');
  }

  for (const [name, value] of Object.entries(httpError.headers ?? {})) res.setHeader(name, value);
  const requestId = typeof req.id === 'string' ? req.id : undefined;
  res
    .status(httpError.status)
    .type(PROBLEM_JSON)
    .json(httpError.toProblem({ instance: req.originalUrl.split('?')[0], requestId }));
};

import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../logger.js';
import { databaseErrorCode, toHttpError } from '../infrastructure/database/errors.js';
import { HttpError } from './problem.js';

const PROBLEM_JSON = 'application/problem+json';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'Not Found', `No route matches ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).type(PROBLEM_JSON).json(err.toProblem(req.originalUrl));
    return;
  }

  // Database errors: log the code only (messages can contain hosts or values).
  const dbError = toHttpError(err);
  if (dbError) {
    logger.warn({ dbCode: databaseErrorCode(err), status: dbError.status }, 'Database error');
    res.status(dbError.status).type(PROBLEM_JSON).json(dbError.toProblem(req.originalUrl));
    return;
  }

  // Unexpected error: log details server-side, return a generic body to the client.
  logger.error({ err }, 'Unhandled error');
  res
    .status(500)
    .type(PROBLEM_JSON)
    .json(new HttpError(500, 'Internal Server Error').toProblem(req.originalUrl));
};

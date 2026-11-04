import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { Errors, type FieldError } from './problem.js';

type Location = 'params' | 'query' | 'body';

export type RequestSchemas = Partial<Record<Location, z.ZodType>>;

export interface ValidatedRequest {
  params?: unknown;
  query?: unknown;
  body?: unknown;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Parsed values from `validate()`; use these instead of the raw inputs. */
    validated: ValidatedRequest;
  }
}

/**
 * Validates path parameters, query and body with Zod (API Design §9). Use
 * `z.strictObject` so unknown fields are rejected. On failure, responds with
 * 400 VALIDATION_FAILED and a field list; nothing reaches the handler.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  const locations = (['params', 'query', 'body'] as const).filter((l) => schemas[l]);
  return (req, _res, next) => {
    const errors: FieldError[] = [];
    const validated: ValidatedRequest = {};
    for (const location of locations) {
      const result = schemas[location]!.safeParse(req[location] ?? {});
      if (result.success) {
        validated[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          errors.push({
            path: [location, ...issue.path.map(String)].join('.'),
            message: issue.message,
          });
        }
      }
    }
    if (errors.length > 0) {
      next(Errors.validation(errors));
      return;
    }
    req.validated = validated;
    if (validated.body !== undefined) req.body = validated.body;
    next();
  };
}

/** Typed access to values parsed by `validate()`. */
export function validated<T>(req: { validated?: ValidatedRequest }, location: Location): T {
  return req.validated?.[location] as T;
}

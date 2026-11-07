/**
 * RFC 9457 Problem Details — the error contract from the Initial API Design §8:
 * a stable machine-readable `code`, the `requestId` for support, and a field
 * list in `errors` for validation failures.
 */
export const ERROR_TYPE_BASE = 'https://educomply.dev/errors/';

export interface FieldError {
  /** Location-prefixed field path, e.g. "body.email" or "query.limit". */
  path: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: FieldError[];
}

export interface HttpErrorOptions {
  detail?: string;
  errors?: FieldError[];
  /** Extra response headers, e.g. Retry-After for 429. */
  headers?: Record<string, string>;
}

/** Converts a code such as VALIDATION_FAILED into its problem type URI. */
export function problemType(code: string): string {
  return `${ERROR_TYPE_BASE}${code.toLowerCase().replace(/_/g, '-')}`;
}

export class HttpError extends Error {
  public readonly detail?: string;
  public readonly errors?: FieldError[];
  public readonly headers?: Record<string, string>;

  constructor(
    public readonly status: number,
    /** Stable UPPER_SNAKE_CASE code the frontend switches on. */
    public readonly code: string,
    public readonly title: string,
    options: HttpErrorOptions = {},
  ) {
    super(options.detail ?? title);
    this.name = 'HttpError';
    this.detail = options.detail;
    this.errors = options.errors;
    this.headers = options.headers;
  }

  toProblem(context: { instance?: string; requestId?: string } = {}): ProblemDetails {
    return {
      type: problemType(this.code),
      title: this.title,
      status: this.status,
      code: this.code,
      ...(this.detail ? { detail: this.detail } : {}),
      ...(context.instance ? { instance: context.instance } : {}),
      ...(context.requestId ? { requestId: context.requestId } : {}),
      ...(this.errors ? { errors: this.errors } : {}),
    };
  }
}

/** Common errors shared by all modules. */
export const Errors = {
  validation: (errors: FieldError[], detail = 'The request is invalid.') =>
    new HttpError(400, 'VALIDATION_FAILED', 'Request validation failed', { detail, errors }),
  /** No session or an expired session (API Design §8: 401 SESSION_EXPIRED). */
  sessionExpired: (detail = 'Sign in to continue.') =>
    new HttpError(401, 'SESSION_EXPIRED', 'Unauthorized', { detail }),
  forbidden: (detail = 'You do not have permission to perform this action.') =>
    new HttpError(403, 'FORBIDDEN', 'Forbidden', { detail }),
  csrfInvalid: () =>
    new HttpError(403, 'CSRF_INVALID', 'Forbidden', {
      detail: 'Missing or invalid X-CSRF-Token header.',
    }),
  conflict: (code: string, detail: string) => new HttpError(409, code, 'Conflict', { detail }),
  notFound: (detail?: string) =>
    new HttpError(404, 'NOT_FOUND', 'Not Found', detail ? { detail } : {}),
  payloadTooLarge: () =>
    new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Payload Too Large', {
      detail: 'The request body exceeds the allowed size.',
    }),
  unsupportedMediaType: () =>
    new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported Media Type', {
      detail: 'The request body encoding is not supported.',
    }),
  rateLimited: (retryAfterSeconds: number) =>
    new HttpError(429, 'RATE_LIMITED', 'Too Many Requests', {
      detail: 'Rate limit exceeded. Try again later.',
      headers: { 'Retry-After': String(retryAfterSeconds) },
    }),
  internal: () => new HttpError(500, 'INTERNAL_ERROR', 'Internal Server Error'),
  serviceUnavailable: (detail = 'A required service is temporarily unavailable.') =>
    new HttpError(503, 'SERVICE_UNAVAILABLE', 'Service Unavailable', { detail }),
};

/**
 * RFC 9457 Problem Details — the error format defined in the Initial API Design (§8).
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly type = 'about:blank',
  ) {
    super(detail ?? title);
    this.name = 'HttpError';
  }

  toProblem(instance?: string): ProblemDetails {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      ...(this.detail ? { detail: this.detail } : {}),
      ...(instance ? { instance } : {}),
    };
  }
}

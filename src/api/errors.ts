export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const UNAUTHORIZED_MESSAGE = 'Your login is no longer valid. Run tokenaires login again.';
export const NOT_LOGGED_IN_MESSAGE = 'You are not logged in. Run tokenaires login first.';

const SIGNATURE_PROBLEM = /signature|signed|clock|already sent/i;
export const CLOCK_HINT = 'If this keeps happening, turn on automatic date, time and time zone on this computer and try again.';

export function describeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return SIGNATURE_PROBLEM.test(error.message) ? `${error.message} ${CLOCK_HINT}` : UNAUTHORIZED_MESSAGE;
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof UsageError) return error.message;
  if (error instanceof Error) return `Something went wrong: ${error.message}`;
  return 'Something went wrong.';
}

export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "conflict"
  | "rate_limited";

/** An expected failure that is safe to show to the user. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function assert(condition: unknown, code: ErrorCode, message: string): asserts condition {
  if (!condition) throw new AppError(code, message);
}

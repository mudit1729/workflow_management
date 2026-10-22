// Errors the data layer throws. `ApiError` is what `POST /api/ops` answers with 409 or 422
// (contract 1.10); the mock server throws the same class, so callers handle one shape.
import type { Conflict, Unprocessable } from "@/gen/types";

export class ApiError extends Error {
  readonly status: 409 | 422;
  readonly body: Conflict | Unprocessable;

  constructor(status: 409, body: Conflict, message?: string);
  constructor(status: 422, body: Unprocessable, message?: string);
  constructor(status: 409 | 422, body: Conflict | Unprocessable, message?: string) {
    super(message ?? describeBody(status, body));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export type ConflictError = ApiError & { status: 409; body: Conflict };
export type UnprocessableError = ApiError & { status: 422; body: Unprocessable };

export function isConflictError(e: unknown): e is ConflictError {
  return e instanceof ApiError && e.status === 409;
}

export function isUnprocessableError(e: unknown): e is UnprocessableError {
  return e instanceof ApiError && e.status === 422;
}

/** A read of something that does not exist (404). Queries do not retry it. */
export class NotFoundError extends Error {
  readonly status = 404;
  constructor(what: string) {
    super(`${what} was not found.`);
    this.name = "NotFoundError";
  }
}

function describeBody(status: 409 | 422, body: Conflict | Unprocessable): string {
  if (status === 409) return (body as Conflict).reason;
  const u = body as Unprocessable;
  return u.gaps?.[0] ?? u.diagnostics[0]?.message ?? "The change was rejected.";
}

/** The first thing worth showing for a 422: a gap, else the first diagnostic. */
export function firstProblem(e: UnprocessableError): { message: string; hint?: string } {
  const gap = e.body.gaps?.[0];
  if (gap) return { message: gap };
  const diag = e.body.diagnostics[0];
  if (diag) return { message: diag.message, hint: diag.fix };
  return { message: "The change was rejected." };
}

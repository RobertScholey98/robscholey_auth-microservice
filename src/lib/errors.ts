import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import type { ErrorField, ErrorResponse } from '@robscholey/contracts';
import { ErrorCode } from '@robscholey/contracts';

/**
 * Base class for every error the auth service throws on purpose. Route
 * handlers raise an {@link AppError} subclass; the single `app.onError`
 * middleware converts it to the shared {@link ErrorResponse} envelope.
 */
export abstract class AppError extends Error {
  /** Stable, machine-readable identifier — see `ErrorCode` in contracts. */
  abstract readonly code: ErrorCode;
  /** HTTP status code the middleware should respond with. */
  abstract readonly status: ContentfulStatusCode;
  /** Field-level detail; populated only on validation errors. */
  readonly fields?: ErrorField[];

  /**
   * @param message - Human-facing message surfaced through the wire envelope.
   * @param fields - Optional per-field validation issues.
   */
  constructor(message: string, fields?: ErrorField[]) {
    super(message);
    this.fields = fields;
  }
}

/**
 * Thrown when a request body or query string fails schema validation. The
 * `ValidationFailed` code is hard-coded because there is only ever one
 * "zod said no" outcome, no matter the endpoint.
 */
export class ValidationError extends AppError {
  readonly code = ErrorCode.ValidationFailed;
  readonly status = 400 as const;
}

/** Thrown for a malformed request that is not specifically a schema failure. */
export class BadRequestError extends AppError {
  readonly code: ErrorCode;
  readonly status = 400 as const;
  /**
   * @param code - Specific error code (e.g. `ErrorCode.AdminAppInConfig`).
   * @param message - Human-facing message.
   */
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Thrown when authentication fails or is missing. Maps to HTTP 401. */
export class UnauthorizedError extends AppError {
  readonly code: ErrorCode;
  readonly status = 401 as const;
  /**
   * @param code - Specific error code (e.g. `ErrorCode.AuthInvalidCredentials`).
   * @param message - Human-facing message.
   */
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Thrown when the caller is authenticated but not permitted. Maps to HTTP 403. */
export class ForbiddenError extends AppError {
  readonly code: ErrorCode;
  readonly status = 403 as const;
  /**
   * @param code - Specific error code (e.g. `ErrorCode.LoggingAppNotPermitted`).
   * @param message - Human-facing message.
   */
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Thrown when a targeted resource does not exist. Maps to HTTP 404. */
export class NotFoundError extends AppError {
  readonly code: ErrorCode;
  readonly status = 404 as const;
  /**
   * @param code - Specific error code (e.g. `ErrorCode.AdminUserNotFound`).
   * @param message - Human-facing message.
   */
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Thrown when a request conflicts with existing state. Maps to HTTP 409. */
export class ConflictError extends AppError {
  readonly code: ErrorCode;
  readonly status = 409 as const;
  /**
   * @param code - Specific error code (e.g. `ErrorCode.AdminCodeConflict`).
   * @param message - Human-facing message.
   */
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** HTTP 500 used when the error mapper encounters something it does not recognise. */
const INTERNAL_STATUS: ContentfulStatusCode = 500;

/**
 * Central error-to-envelope mapper. Registered on the Hono app so every
 * throw from a handler or schema parse lands here and exits as the shared
 * {@link ErrorResponse} shape from `@robscholey/contracts`.
 *
 * Exported so tests can assert the mapping in isolation without spinning up
 * the full route tree.
 *
 * @param err - The caught error.
 * @param c - The Hono request context.
 * @returns A JSON response carrying the error envelope.
 */
export function handleAppError(err: Error, c: Context): Response {
  let appError: AppError;
  if (err instanceof ZodError) {
    const fields: ErrorField[] = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    appError = new ValidationError('Validation failed', fields);
  } else if (err instanceof AppError) {
    appError = err;
  } else {
    // TODO(phase-a7): replace with the structured logger once it lands.
    console.error('[auth] unhandled', err);
    const body: ErrorResponse = {
      error: {
        code: ErrorCode.Internal,
        message: 'Something went wrong',
      },
    };
    return c.json(body, INTERNAL_STATUS);
  }

  const body: ErrorResponse = {
    error: {
      code: appError.code,
      message: appError.message,
      fields: appError.fields,
    },
  };
  return c.json(body, appError.status);
}

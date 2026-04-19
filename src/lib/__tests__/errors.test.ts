import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { ErrorCode } from '@robscholey/contracts';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  handleAppError,
} from '../errors';

/** Builds a tiny Hono app whose only route is a throwing function. */
function appThatThrows(err: Error): Hono {
  const app = new Hono();
  app.onError(handleAppError);
  app.get('/boom', () => {
    throw err;
  });
  return app;
}

describe('handleAppError', () => {
  it('maps a ZodError to a 400 validation.failed envelope with fields[]', async () => {
    const schema = z.object({ name: z.string().min(1) });
    let zodErr: Error | null = null;
    try {
      schema.parse({});
    } catch (e) {
      if (e instanceof Error) {
        zodErr = e;
      }
    }
    expect(zodErr).toBeInstanceOf(Error);

    const res = await appThatThrows(zodErr!).request('/boom');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation.failed');
    expect(body.error.message).toBe('Validation failed');
    expect(Array.isArray(body.error.fields)).toBe(true);
    expect(body.error.fields.length).toBeGreaterThan(0);
    expect(body.error.fields[0]).toEqual({
      path: expect.any(String),
      message: expect.any(String),
    });
  });

  it('maps a ValidationError to a 400 envelope', async () => {
    const res = await appThatThrows(new ValidationError('nope')).request('/boom');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation.failed');
    expect(body.error.message).toBe('nope');
  });

  it('maps a BadRequestError to a 400 envelope with its code', async () => {
    const res = await appThatThrows(
      new BadRequestError('admin.app_owner_only_toggle', 'not toggleable'),
    ).request('/boom');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('admin.app_owner_only_toggle');
    expect(body.error.message).toBe('not toggleable');
  });

  it('maps an UnauthorizedError to a 401 envelope', async () => {
    const res = await appThatThrows(
      new UnauthorizedError('auth.invalid_credentials', 'Invalid credentials'),
    ).request('/boom');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('auth.invalid_credentials');
    expect(body.error.message).toBe('Invalid credentials');
  });

  it('maps a ForbiddenError to a 403 envelope', async () => {
    const res = await appThatThrows(
      new ForbiddenError('logging.app_not_permitted', 'nope'),
    ).request('/boom');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('logging.app_not_permitted');
  });

  it('maps a NotFoundError to a 404 envelope', async () => {
    const res = await appThatThrows(
      new NotFoundError('admin.user_not_found', 'User not found'),
    ).request('/boom');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('admin.user_not_found');
    expect(body.error.message).toBe('User not found');
  });

  it('maps a ConflictError to a 409 envelope', async () => {
    const res = await appThatThrows(
      new ConflictError('admin.code_conflict', 'Code already exists'),
    ).request('/boom');
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('admin.code_conflict');
    expect(body.error.message).toBe('Code already exists');
  });

  it('maps an unknown Error to a 500 internal_error envelope', async () => {
    const res = await appThatThrows(new Error('boom')).request('/boom');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('internal_error');
    expect(body.error.message).toBe('Something went wrong');
  });

  it('AppError subclasses are instanceof AppError', () => {
    expect(new ValidationError('x')).toBeInstanceOf(AppError);
    expect(new BadRequestError(ErrorCode.Internal, 'm')).toBeInstanceOf(AppError);
    expect(new UnauthorizedError(ErrorCode.Internal, 'm')).toBeInstanceOf(AppError);
    expect(new ForbiddenError(ErrorCode.Internal, 'm')).toBeInstanceOf(AppError);
    expect(new NotFoundError(ErrorCode.Internal, 'm')).toBeInstanceOf(AppError);
    expect(new ConflictError(ErrorCode.Internal, 'm')).toBeInstanceOf(AppError);
  });
});

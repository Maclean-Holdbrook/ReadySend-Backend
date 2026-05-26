import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = 'Not found') {
  return new AppError(404, 'not_found', message);
}

export function badRequest(code, message, details = undefined) {
  return new AppError(400, code, message, details);
}

export function mapSupabaseRpcError(error) {
  const message = error?.message || '';

  if (message.includes('invalid_confirmation_token')) {
    return new AppError(404, 'invalid_confirmation_token', 'This confirmation link is invalid.');
  }

  if (message.includes('confirmation_token_expired')) {
    return new AppError(410, 'confirmation_token_expired', 'This confirmation link has expired.');
  }

  if (message.includes('order_cancelled')) {
    return new AppError(409, 'order_cancelled', 'This order has been cancelled by the seller.');
  }

  return new AppError(500, 'confirmation_failed', 'Could not confirm this order. Please try again.');
}

export function errorHandler(error, req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'validation_failed',
        message: 'Request validation failed.',
        details: error.flatten()
      }
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
  }

  console.error('Unhandled API error', {
    method: req.method,
    path: req.path,
    message: error.message,
    stack: error.stack
  });

  return res.status(500).json({
    error: {
      code: 'internal_error',
      message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : error.message || 'Something went wrong.',
      ...(process.env.NODE_ENV === 'production' ? {} : { details: error.details })
    }
  });
}

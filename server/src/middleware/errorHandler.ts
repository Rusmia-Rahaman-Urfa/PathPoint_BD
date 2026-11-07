import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { ApiError, ERROR_CODES, type ErrorCode, type ErrorDetail } from '../lib/ApiError.js';
import type { ErrorEnvelope } from '../lib/ApiResponse.js';
import { logger } from '../lib/logger.js';
import { formatZodIssues } from '../lib/validation.js';

interface NormalizedError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
}

function normalize(error: unknown): NormalizedError {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 422,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: formatZodIssues(error),
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 422,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Document validation failed',
      details: Object.values(error.errors).map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: 400,
      code: ERROR_CODES.BAD_REQUEST,
      message: `Invalid value for "${error.path}"`,
    };
  }

  const mongoError = error as { code?: number; name?: string; keyValue?: Record<string, unknown> };
  if (mongoError?.code === 11000) {
    const fields = Object.keys(mongoError.keyValue ?? {});
    return {
      statusCode: 409,
      code: ERROR_CODES.CONFLICT,
      message: 'A record with these details already exists',
      details: fields.map((field) => ({ path: field, message: `${field} must be unique` })),
    };
  }

  const jwtError = error as { name?: string };
  if (
    jwtError?.name === 'JsonWebTokenError' ||
    jwtError?.name === 'TokenExpiredError' ||
    jwtError?.name === 'NotBeforeError'
  ) {
    return {
      statusCode: 401,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid or expired access token',
    };
  }

  const syntaxError = error as { name?: string; type?: string };
  if (syntaxError?.name === 'SyntaxError' && syntaxError?.type === 'entity.parse.failed') {
    return {
      statusCode: 400,
      code: ERROR_CODES.BAD_REQUEST,
      message: 'Malformed JSON body',
    };
  }

  return {
    statusCode: 500,
    code: ERROR_CODES.INTERNAL,
    message: 'Internal server error',
  };
}

/**
 * Terminal error middleware. Guarantees every failure - including 404s, Zod
 * issues, Mongoose casts and duplicate keys - leaves through one envelope.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const requestId = req.requestId ?? 'unknown';
  const normalized = normalize(error);
  const isServerError = normalized.statusCode >= 500;

  const logPayload = {
    requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode: normalized.statusCode,
    code: normalized.code,
  };

  if (isServerError) {
    logger.error({ ...logPayload, err: error }, 'request failed');
  } else {
    logger.warn(logPayload, 'request rejected');
  }

  // Never leak internals or stack traces in production.
  const message =
    isServerError && env.isProduction ? 'Internal server error' : normalized.message;

  const body: ErrorEnvelope = {
    success: false,
    error: {
      code: normalized.code,
      message,
      ...(normalized.details?.length ? { details: normalized.details } : {}),
      requestId,
    },
    timestamp: new Date().toISOString(),
  };

  res.status(normalized.statusCode).json(body);
};

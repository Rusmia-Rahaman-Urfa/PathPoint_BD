/**
 * The single error type every layer throws. Controllers/services never build
 * HTTP responses for failures - the central error handler owns that.
 */

export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: ErrorDetail[];
  readonly isOperational = true;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Bad request', details?: ErrorDetail[]): ApiError {
    return new ApiError(400, ERROR_CODES.BAD_REQUEST, message, details);
  }

  static validation(message = 'Request validation failed', details?: ErrorDetail[]): ApiError {
    return new ApiError(422, ERROR_CODES.VALIDATION_ERROR, message, details);
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, ERROR_CODES.UNAUTHORIZED, message);
  }

  static forbidden(message = 'You do not have permission to perform this action'): ApiError {
    return new ApiError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(message = 'Resource already exists'): ApiError {
    return new ApiError(409, ERROR_CODES.CONFLICT, message);
  }

  static tooManyRequests(message = 'Too many requests, please slow down'): ApiError {
    return new ApiError(429, ERROR_CODES.RATE_LIMITED, message);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable'): ApiError {
    return new ApiError(503, ERROR_CODES.SERVICE_UNAVAILABLE, message);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, ERROR_CODES.INTERNAL, message);
  }
}

import type { Response } from 'express';
import type { ErrorCode, ErrorDetail } from './ApiError.js';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: object;
  timestamp: string;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    requestId: string;
  };
  timestamp: string;
}

export interface SendOptions {
  statusCode?: number;
  meta?: object;
}

export function sendSuccess<T>(res: Response, data: T, options: SendOptions = {}): Response {
  const body: SuccessEnvelope<T> = {
    success: true,
    data,
    ...(options.meta ? { meta: options.meta } : {}),
    timestamp: new Date().toISOString(),
  };
  return res.status(options.statusCode ?? 200).json(body);
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

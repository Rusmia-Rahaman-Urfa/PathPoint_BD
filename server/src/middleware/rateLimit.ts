import rateLimit, { type Options } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { ApiError } from '../lib/ApiError.js';

const skip = (): boolean => env.isTest;

const reject: Options['handler'] = (_req, _res, next) => {
  next(ApiError.tooManyRequests());
};

const baseOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  handler: reject,
} satisfies Partial<Options>;

/** Broad protection for the whole API surface. */
export const globalLimiter: RequestHandler = rateLimit({
  ...baseOptions,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
});

/** Tighter budget for credential endpoints to blunt brute-force attempts. */
export const authLimiter: RequestHandler = rateLimit({
  ...baseOptions,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
});

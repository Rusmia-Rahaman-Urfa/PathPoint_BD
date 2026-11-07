import type { RequestHandler } from 'express';
import { ApiError } from '../lib/ApiError.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};

import type { RequestHandler } from 'express';
import type { UserRole } from '../config/constants.js';
import { ApiError } from '../lib/ApiError.js';

/**
 * Role gate. Always runs after `authenticate`; if it is mounted on a public
 * route by mistake it still fails closed with 401 rather than 403.
 */
export const authorize = (...allowedRoles: UserRole[]): RequestHandler => {
  return (req, _res, next) => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(ApiError.forbidden(`Requires one of the following roles: ${allowedRoles.join(', ')}`));
      return;
    }
    next();
  };
};

import type { RequestHandler } from 'express';
import { UserModel } from '../modules/users/user.model.js';
import { ApiError } from '../lib/ApiError.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { verifyAccessToken } from '../lib/jwt.js';

/**
 * Bearer-token authentication.
 *
 * The token is verified cryptographically first, then the user is re-read from
 * Mongo so deactivated or deleted accounts lose access immediately instead of
 * waiting for the token to expire.
 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.header('authorization');
  if (!header) {
    throw ApiError.unauthorized('Missing Authorization header');
  }

  const [scheme, token, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    throw ApiError.unauthorized('Authorization header must be "Bearer <token>"');
  }

  const payload = verifyAccessToken(token);

  const user = await UserModel.findById(payload.sub).select('_id email role isActive').lean();
  if (!user) {
    throw ApiError.unauthorized('Account no longer exists');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('Account is deactivated');
  }

  req.user = {
    id: String(user._id),
    email: user.email,
    role: user.role,
  };

  next();
});

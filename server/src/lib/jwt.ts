import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { USER_ROLES, type UserRole } from '../config/constants.js';
import { ApiError } from './ApiError.js';

const AccessTokenPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  role: z.enum(USER_ROLES),
});

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface SignedAccessToken {
  token: string;
  expiresIn: string;
  tokenType: 'Bearer';
}

export function signAccessToken(payload: AccessTokenPayload): SignedAccessToken {
  const token = jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });

  return { token, expiresIn: env.JWT_EXPIRES_IN, tokenType: 'Bearer' };
}

/**
 * Verifies signature, expiry, issuer and audience, then re-validates the
 * payload shape - a token we did not mint should never reach a controller.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });

    if (typeof decoded === 'string') {
      throw ApiError.unauthorized('Malformed access token');
    }

    const parsed = AccessTokenPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
      throw ApiError.unauthorized('Malformed access token');
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthorized('Invalid or expired access token');
  }
}

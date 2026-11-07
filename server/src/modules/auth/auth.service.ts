import type { UserRole } from '../../config/constants.js';
import { ApiError } from '../../lib/ApiError.js';
import { signAccessToken } from '../../lib/jwt.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { UserModel } from '../users/user.model.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

export interface AuthResult {
  user: Record<string, unknown>;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

let timingEqualizerHash: string | null = null;

/**
 * Burning a comparable bcrypt round when the email is unknown keeps the
 * response time of "no such user" and "wrong password" indistinguishable.
 */
async function equalizeTiming(password: string): Promise<void> {
  timingEqualizerHash ??= await hashPassword('pathpoint-timing-equalizer');
  await verifyPassword(password, timingEqualizerHash);
}

function toAuthResult(user: { toJSON: () => unknown }): AuthResult {
  const json = user.toJSON() as Record<string, unknown>;

  const signed = signAccessToken({
    sub: String(json.id),
    email: String(json.email),
    role: json.role as UserRole,
  });

  return {
    user: json,
    accessToken: signed.token,
    tokenType: signed.tokenType,
    expiresIn: signed.expiresIn,
  };
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const phone = input.phone?.trim();

    const existing = await UserModel.findOne({
      $or: [{ email }, ...(phone ? [{ phone }] : [])],
    })
      .select('_id email phone')
      .lean();

    if (existing) {
      throw ApiError.conflict(
        existing.email === email
          ? 'Email is already registered'
          : 'Phone number is already registered',
      );
    }

    const passwordHash = await hashPassword(input.password);

    try {
      const user = await UserModel.create({
        name: input.name.trim(),
        email,
        ...(phone ? { phone } : {}),
        passwordHash,
        role: input.role ?? 'rider',
      });

      return toAuthResult(user);
    } catch (error) {
      // Unique-index race: two registrations for the same email in flight.
      if ((error as { code?: number }).code === 11000) {
        throw ApiError.conflict('Email or phone number is already registered');
      }
      throw error;
    }
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();

    const user = await UserModel.findOne({ email }).select('+passwordHash');

    if (!user) {
      await equalizeTiming(input.password);
      throw ApiError.unauthorized('Invalid email or password');
    }

    const passwordMatches = await verifyPassword(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('Account is deactivated');
    }

    return toAuthResult(user);
  },

  async getProfile(userId: string): Promise<Record<string, unknown>> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }
    return user.toJSON() as Record<string, unknown>;
  },
};

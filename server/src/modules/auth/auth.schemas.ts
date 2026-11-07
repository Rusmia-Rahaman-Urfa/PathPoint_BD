import { z } from 'zod';
import { BD_PHONE_REGEX } from '../../config/constants.js';

/**
 * Request schemas are the contract: the same object validates input at runtime
 * and generates the OpenAPI document. `.strictObject` rejects unknown keys so
 * clients cannot smuggle fields (e.g. `role: "admin"`) into the service layer.
 */

export const registerSchema = z.strictObject({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  email: z.email('A valid email address is required'),
  phone: z
    .string()
    .regex(BD_PHONE_REGEX, 'Phone must be a Bangladeshi number in +8801XXXXXXXXX form')
    .optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d).+$/,
      'Password must contain at least one letter and one number',
    )
    .describe('8-72 characters, at least one letter and one number'),
  // Admin accounts are provisioned out-of-band, never self-registered.
  role: z.enum(['rider', 'driver']).optional(),
});

export const loginSchema = z.strictObject({
  email: z.email('A valid email address is required'),
  password: z.string().min(1, 'Password is required').max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

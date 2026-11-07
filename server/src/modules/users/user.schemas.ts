import { z } from 'zod';
import { USER_ROLES } from '../../config/constants.js';

/** Response schema - also reused by the OpenAPI document. */
export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  phone: z.string().optional(),
  role: z.enum(USER_ROLES),
  ratingAvg: z.number(),
  ratingCount: z.number(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PublicUser = z.infer<typeof publicUserSchema>;

import type { UserRole } from '../config/constants.js';

declare global {
  namespace Express {
    interface Request {
      /** Correlation id assigned by the requestId middleware. */
      requestId: string;
      /** Populated by the authenticate middleware after a valid bearer token. */
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

export {};

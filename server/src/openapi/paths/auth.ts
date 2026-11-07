import { env } from '../../config/env.js';
import { errorResponse, jsonBody, successEnvelope } from '../registry.js';

const prefix = env.API_PREFIX;

export const authPaths = {
  [`${prefix}/auth/register`]: {
    post: {
      tags: ['Auth'],
      summary: 'Register a rider or driver account',
      description:
        'Creates an account and returns a signed JWT access token. Unknown keys are rejected with 422. Admin accounts cannot be self-registered.',
      operationId: 'register',
      requestBody: jsonBody('RegisterInput', {
        name: 'Ayesha Rahman',
        email: 'ayesha@example.com',
        phone: '+8801712345678',
        password: 'Dhaka2026',
        role: 'rider',
      }),
      responses: {
        201: successEnvelope('AuthResponse', 'Account created and access token issued'),
        409: errorResponse('Email or phone number already registered'),
        422: errorResponse('Validation failed (details array pinpoints the field)'),
        429: errorResponse('Rate limit exceeded'),
      },
    },
  },

  [`${prefix}/auth/login`]: {
    post: {
      tags: ['Auth'],
      summary: 'Exchange credentials for an access token',
      description:
        'Returns the same generic 401 for unknown email and wrong password, and burns an equivalent bcrypt round in both cases.',
      operationId: 'login',
      requestBody: jsonBody('LoginInput', {
        email: 'ayesha@example.com',
        password: 'Dhaka2026',
      }),
      responses: {
        200: successEnvelope('AuthResponse', 'Authenticated'),
        401: errorResponse('Invalid credentials'),
        403: errorResponse('Account deactivated'),
        422: errorResponse('Validation failed'),
        429: errorResponse('Rate limit exceeded'),
      },
    },
  },

  [`${prefix}/auth/me`]: {
    get: {
      tags: ['Auth'],
      summary: 'Get the authenticated user',
      description: 'Requires `Authorization: Bearer <token>`.',
      operationId: 'getCurrentUser',
      security: [{ bearerAuth: [] }],
      responses: {
        200: successEnvelope('User', 'Current user profile'),
        401: errorResponse('Missing, malformed or expired token'),
        403: errorResponse('Account deactivated'),
      },
    },
  },
} as const;

import { env } from '../config/env.js';
import { API_VERSION } from '../config/constants.js';
import { ERROR_CODES } from '../lib/ApiError.js';
import { loginSchema, registerSchema } from '../modules/auth/auth.schemas.js';
import {
  createRideSchema,
  listRidesQuerySchema,
  rideResponseSchema,
  updateRideSchema,
} from '../modules/rides/ride.schemas.js';
import {
  matchSearchMetaSchema,
  matchSearchResultSchema,
  matchSearchSchema,
} from '../modules/matching/matching.schemas.js';
import { publicUserSchema } from '../modules/users/user.schemas.js';
import {
  cancelBookingSchema,
  createBookingSchema,
  listBookingsQuerySchema,
  bookingResponseSchema,
} from '../modules/bookings/booking.schemas.js';
import {
  createRideRequestSchema,
  listRideRequestsQuerySchema,
  reverseMatchQuerySchema,
  rideRequestResponseSchema,
  rideRequestReverseMetaSchema,
} from '../modules/requests/rideRequest.schemas.js';
import {
  listTrafficQuerySchema,
  simulateTrafficSchema,
  trafficEventSchema,
  trafficMetaSchema,
  trafficStatsSchema,
  trafficStreamQuerySchema,
} from '../modules/traffic/traffic.schemas.js';
import { PAGINATION_META_SCHEMA, schemaRef, toJsonSchema } from './registry.js';
import { authPaths } from './paths/auth.js';
import { bookingPaths } from './paths/bookings.js';
import { matchingPaths } from './paths/matching.js';
import { requestPaths } from './paths/requests.js';
import { ridePaths } from './paths/rides.js';
import { systemPaths } from './paths/system.js';
import { trafficPaths } from './paths/traffic.js';

const errorCodes = Object.values(ERROR_CODES);

export const openApiDocument = {
  openapi: '3.1.0',

  info: {
    title: 'PathPoint_BD API',
    version: API_VERSION,
    description: [
      'Backend for **PathPoint_BD**, an urban transit and commuter carpooling platform for dense cities such as Dhaka and Chattogram.',
      '',
      '**How to try it**',
      '1. `POST /api/v1/auth/register` (or `/auth/login` with an existing account).',
      '2. Copy `data.accessToken` from the response.',
      '3. Click **Authorize** and paste the token (no `Bearer ` prefix needed).',
      '4. Call `GET /api/v1/auth/me`.',
      '',
      '**Conventions**',
      '- Success: `{ success: true, data, timestamp }`',
      '- Failure: `{ success: false, error: { code, message, details?, requestId }, timestamp }`',
      '- Validation is enforced with Zod `strictObject` schemas: unknown keys are rejected with **422**, not ignored.',
      '- Every response carries an `x-request-id` header that matches `error.requestId`.',
    ].join('\n'),
  },

  servers: [{ url: '/', description: 'Current deployment' }],

  tags: [
    { name: 'Auth', description: 'Registration, login and identity' },
    { name: 'Rides', description: 'Ride offers, geospatial search and ownership rules' },
    {
      name: 'Matching',
      description: 'Geospatial commute matching with transparent multi-factor scoring',
    },
    {
      name: 'Requests',
      description: 'Rider travel intent and driver-facing reverse matching',
    },
    {
      name: 'Bookings',
      description: 'Atomic seat reservation, driver confirmation and cancellation',
    },
    {
      name: 'Traffic',
      description: 'Live congestion events over Server-Sent Events, plus a demo simulator',
    },
    { name: 'System', description: 'Health and readiness probes' },
  ],

  security: [],

  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: `HS256 JWT. Expires in ${env.JWT_EXPIRES_IN}. Issuer \`${env.JWT_ISSUER}\`, audience \`${env.JWT_AUDIENCE}\`.`,
      },
    },

    schemas: {
      RegisterInput: toJsonSchema(registerSchema, 'input'),
      LoginInput: toJsonSchema(loginSchema, 'input'),
      User: toJsonSchema(publicUserSchema, 'output'),

      CreateRideInput: toJsonSchema(createRideSchema, 'input'),
      UpdateRideInput: toJsonSchema(updateRideSchema, 'input'),
      Ride: toJsonSchema(rideResponseSchema, 'output'),
      RideListQuery: toJsonSchema(listRidesQuerySchema, 'input'),
      PaginationMeta: PAGINATION_META_SCHEMA,

      MatchSearchInput: toJsonSchema(matchSearchSchema, 'input'),
      MatchSearchResult: toJsonSchema(matchSearchResultSchema, 'output'),
      MatchSearchMeta: toJsonSchema(matchSearchMetaSchema, 'output'),

      CreateRideRequestInput: toJsonSchema(createRideRequestSchema, 'input'),
      RideRequestListQuery: toJsonSchema(listRideRequestsQuerySchema, 'input'),
      ReverseMatchQuery: toJsonSchema(reverseMatchQuerySchema, 'input'),
      RideRequest: toJsonSchema(rideRequestResponseSchema, 'output'),
      RideRequestReverseMeta: toJsonSchema(rideRequestReverseMetaSchema, 'output'),

      CreateBookingInput: toJsonSchema(createBookingSchema, 'input'),
      CancelBookingInput: toJsonSchema(cancelBookingSchema, 'input'),
      BookingListQuery: toJsonSchema(listBookingsQuerySchema, 'input'),
      Booking: toJsonSchema(bookingResponseSchema, 'output'),

      SimulateTrafficInput: toJsonSchema(simulateTrafficSchema, 'input'),
      TrafficListQuery: toJsonSchema(listTrafficQuerySchema, 'input'),
      TrafficStreamQuery: toJsonSchema(trafficStreamQuerySchema, 'input'),
      TrafficEvent: toJsonSchema(trafficEventSchema, 'output'),
      TrafficMeta: toJsonSchema(trafficMetaSchema, 'output'),
      TrafficStats: toJsonSchema(trafficStatsSchema, 'output'),

      AuthResponse: {
        type: 'object',
        required: ['user', 'accessToken', 'tokenType', 'expiresIn'],
        properties: {
          user: schemaRef('User'),
          accessToken: { type: 'string', description: 'Signed JWT access token' },
          tokenType: { type: 'string', const: 'Bearer' },
          expiresIn: { type: 'string', example: env.JWT_EXPIRES_IN },
        },
      },

      ErrorResponse: {
        type: 'object',
        required: ['success', 'error', 'timestamp'],
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            required: ['code', 'message', 'requestId'],
            properties: {
              code: { type: 'string', enum: errorCodes },
              message: { type: 'string' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['path', 'message'],
                  properties: {
                    path: { type: 'string', example: 'origin.coordinates.1' },
                    message: { type: 'string' },
                  },
                },
              },
              requestId: { type: 'string', description: 'Correlation id, also returned in x-request-id' },
            },
          },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },

      Health: {
        type: 'object',
        properties: {
          status: { type: 'string', const: 'ok' },
          service: { type: 'string' },
          version: { type: 'string' },
          environment: { type: 'string', enum: ['development', 'test', 'production'] },
          uptimeSeconds: { type: 'integer' },
        },
      },

      Readiness: {
        type: 'object',
        properties: {
          status: { type: 'string', const: 'ready' },
          version: { type: 'string' },
          uptimeSeconds: { type: 'integer' },
          dependencies: {
            type: 'object',
            properties: {
              mongodb: {
                type: 'object',
                properties: {
                  connected: { type: 'boolean' },
                  state: { type: 'string' },
                  name: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
    },
  },

  paths: {
    ...systemPaths,
    ...authPaths,
    ...ridePaths,
    ...matchingPaths,
    ...requestPaths,
    ...bookingPaths,
    ...trafficPaths,
  },
} as const;

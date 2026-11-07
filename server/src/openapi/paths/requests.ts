import { env } from '../../config/env.js';
import { listRideRequestsQuerySchema } from '../../modules/requests/rideRequest.schemas.js';
import {
  errorResponse,
  jsonBody,
  metaArrayEnvelope,
  objectIdParameter,
  paginatedEnvelope,
  queryParameters,
  successEnvelope,
} from '../registry.js';

const prefix = `${env.API_PREFIX}/matches/requests`;

const requestExample = {
  origin: { type: 'Point', coordinates: [90.4043, 23.7937] },
  destination: { type: 'Point', coordinates: [90.3742, 23.7461] },
  originAddress: 'Banani, Dhaka',
  destinationAddress: 'Dhanmondi 27, Dhaka',
  departureAt: '2026-11-07T08:15:00.000Z',
  flexMinutes: 30,
  seats: 1,
  maxFarePerSeat: 120,
  notes: 'Can leave 10 minutes early',
};

export const requestPaths = {
  [prefix]: {
    post: {
      tags: ['Requests'],
      summary: 'Publish a ride request (rider intent)',
      description: [
        'Protected. A rider publishes the trip they *want* to take. This is not a booking:',
        'it reserves no seats and can be discovered by drivers through reverse matching.',
        '',
        '`riderId` always comes from the JWT. `origin` and `destination` are GeoJSON points',
        'inside Bangladesh, and the two must be at least 25 m apart.',
        '`flexMinutes` (1–240) is the rider\'s own time tolerance and is used per-request',
        'during reverse matching. `maxFarePerSeat` is an optional budget ceiling.',
      ].join('\n'),
      operationId: 'createRideRequest',
      security: [{ bearerAuth: [] }],
      requestBody: jsonBody('CreateRideRequestInput', requestExample),
      responses: {
        201: successEnvelope('RideRequest', 'Ride request created'),
        401: errorResponse('Missing or invalid token'),
        422: errorResponse('Validation failed (coordinates, departure, flex window, unknown keys)'),
        429: errorResponse('Rate limit exceeded'),
      },
    },

    get: {
      tags: ['Requests'],
      summary: 'List open ride requests',
      description: [
        'Protected. Lists rider intents with pagination and filters.',
        '`near` switches to a `$geoNear` query on the request origin and orders by distance.',
      ].join('\n'),
      operationId: 'listRideRequests',
      security: [{ bearerAuth: [] }],
      parameters: queryParameters(listRideRequestsQuerySchema),
      responses: {
        200: paginatedEnvelope('RideRequest', 'Paginated ride requests'),
        401: errorResponse('Missing or invalid token'),
        422: errorResponse('Unknown query parameter or invalid filter'),
      },
    },
  },

  [`${prefix}/mine`]: {
    get: {
      tags: ['Requests'],
      summary: 'List my ride requests',
      description: 'Protected. Returns only the requests published by the caller.',
      operationId: 'listMyRideRequests',
      security: [{ bearerAuth: [] }],
      parameters: queryParameters(listRideRequestsQuerySchema),
      responses: {
        200: paginatedEnvelope('RideRequest', 'Paginated ride requests owned by the caller'),
        401: errorResponse('Missing or invalid token'),
      },
    },
  },

  [`${prefix}/reverse`]: {
    get: {
      tags: ['Requests'],
      summary: 'Find riders whose intent fits one of my rides',
      description: [
        'Protected. Driver-facing reverse match for a ride the caller owns (admins exempt).',
        '',
        '`$geoNear` on the request origin finds nearby pickups; `$geoWithin` on the request',
        'destination adds the dropoff tolerance. Each request is filtered against the ride',
        'using **its own** `flexMinutes` (`|ride.departureAt − request.departureAt| ≤ flex`),',
        'so a ±15-minute request is not matched to a ride two hours away. Requests with a',
        '`maxFarePerSeat` below the ride fare are excluded, as are requests for more seats',
        'than the ride has free. The driver\'s own requests never match their own ride.',
        '',
        '`meta` echoes the ride id and candidate counts.',
      ].join('\n'),
      operationId: 'reverseMatchRideRequests',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'rideId',
          in: 'query',
          required: true,
          description: 'Ride owned by the caller',
          schema: { type: 'string', pattern: '^[a-f0-9]{24}$' },
        },
        {
          name: 'pickupRadiusMeters',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 100, maximum: 20_000, default: 2_000 },
        },
        {
          name: 'dropoffRadiusMeters',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 100, maximum: 20_000, default: 2_000 },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
      ],
      responses: {
        200: metaArrayEnvelope(
          'RideRequest',
          'RideRequestReverseMeta',
          'Rider intents that fit the ride',
        ),
        401: errorResponse('Missing or invalid token'),
        403: errorResponse('The ride belongs to another driver'),
        404: errorResponse('Ride not found'),
        409: errorResponse('Ride is cancelled, completed or still a draft'),
        422: errorResponse('Invalid rideId or radii'),
      },
    },
  },

  [`${prefix}/{id}`]: {
    get: {
      tags: ['Requests'],
      summary: 'Get a ride request',
      description: 'Protected. Visible to the rider who created it and to admins.',
      operationId: 'getRideRequest',
      security: [{ bearerAuth: [] }],
      parameters: [objectIdParameter('id', 'Ride request id')],
      responses: {
        200: successEnvelope('RideRequest', 'Ride request detail'),
        401: errorResponse('Missing or invalid token'),
        403: errorResponse('Request belongs to another rider'),
        404: errorResponse('Ride request not found'),
      },
    },

    delete: {
      tags: ['Requests'],
      summary: 'Cancel a ride request',
      description: [
        'Protected. Soft-cancels an open request; repeat calls are idempotent.',
        'Matched requests cannot be cancelled here - cancel the booking instead.',
      ].join('\n'),
      operationId: 'cancelRideRequest',
      security: [{ bearerAuth: [] }],
      parameters: [objectIdParameter('id', 'Ride request id')],
      responses: {
        200: successEnvelope('RideRequest', 'Ride request cancelled'),
        401: errorResponse('Missing or invalid token'),
        403: errorResponse('Request belongs to another rider'),
        404: errorResponse('Ride request not found'),
        409: errorResponse('Request is matched or expired'),
      },
    },
  },
} as const;

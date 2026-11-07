import { env } from '../../config/env.js';
import { listRidesQuerySchema } from '../../modules/rides/ride.schemas.js';
import {
  errorResponse,
  jsonBody,
  paginatedEnvelope,
  pathIdParameter,
  queryParameters,
  successEnvelope,
} from '../registry.js';

const prefix = `${env.API_PREFIX}/rides`;
const listParams = queryParameters(listRidesQuerySchema);

export const ridePaths = {
  [prefix]: {
    post: {
      tags: ['Rides'],
      summary: 'Publish a ride offer',
      description: [
        'Any authenticated user can offer a ride; `driverId` is always taken from the token, never from the body.',
        '`seatsAvailable` is derived from `seatsTotal` and cannot be set by the client.',
        'Coordinates must be GeoJSON `[longitude, latitude]` inside Bangladesh.',
      ].join('\n\n'),
      operationId: 'createRide',
      security: [{ bearerAuth: [] }],
      requestBody: jsonBody('CreateRideInput', {
        origin: { type: 'Point', coordinates: [90.4043, 23.7937] },
        destination: { type: 'Point', coordinates: [90.3742, 23.7461] },
        originAddress: 'Banani, Dhaka',
        destinationAddress: 'Dhanmondi 27, Dhaka',
        departureAt: '2026-11-07T08:15:00.000Z',
        seatsTotal: 3,
        farePerSeat: 80,
        vehicle: { make: 'Toyota', model: 'Corolla', plate: 'DHAKA METRO-GA-12-3456', ac: true },
        preferences: { genderPreference: 'any', maxDetourMeters: 3000 },
      }),
      responses: {
        201: successEnvelope('Ride', 'Ride published; `Location` header points at it'),
        401: errorResponse('Missing or invalid token'),
        422: errorResponse('Validation failed (coordinates, departure, seats, unknown keys)'),
        429: errorResponse('Rate limit exceeded'),
      },
    },

    get: {
      tags: ['Rides'],
      summary: 'List and filter rides',
      description: [
        'Public endpoint. Combine `status`, `driverId`, `dateFrom`/`dateTo`, pagination and sorting.',
        'When `near` is supplied the query runs through `$geoNear` on the `origin` 2dsphere index,',
        'results are ordered by `distanceMeters`, and `radiusMeters` filters the catchment.',
      ].join(' '),
      operationId: 'listRides',
      parameters: listParams,
      responses: {
        200: paginatedEnvelope('Ride', 'Paginated ride list'),
        422: errorResponse('Invalid query parameters'),
      },
    },
  },

  [`${prefix}/mine`]: {
    get: {
      tags: ['Rides'],
      summary: 'List the rides you published',
      operationId: 'listMyRides',
      security: [{ bearerAuth: [] }],
      parameters: listParams.filter((parameter) => parameter.name !== 'driverId'),
      responses: {
        200: paginatedEnvelope('Ride', 'Paginated ride list scoped to the caller'),
        401: errorResponse('Missing or invalid token'),
      },
    },
  },

  [`${prefix}/{id}`]: {
    get: {
      tags: ['Rides'],
      summary: 'Get a ride by id',
      operationId: 'getRide',
      parameters: [pathIdParameter()],
      responses: {
        200: successEnvelope('Ride', 'Ride detail'),
        404: errorResponse('Ride not found'),
        422: errorResponse('Malformed ObjectId'),
      },
    },

    patch: {
      tags: ['Rides'],
      summary: 'Update a ride you own',
      description:
        'Owners (or admins) only. `seatsTotal` cannot drop below the number of seats already booked, and cancelled/completed rides are immutable.',
      operationId: 'updateRide',
      security: [{ bearerAuth: [] }],
      parameters: [pathIdParameter()],
      requestBody: jsonBody('UpdateRideInput', { farePerSeat: 95 }),
      responses: {
        200: successEnvelope('Ride', 'Updated ride'),
        401: errorResponse('Missing or invalid token'),
        403: errorResponse('You do not own this ride'),
        404: errorResponse('Ride not found'),
        409: errorResponse('Ride is cancelled/completed, or seat count is below booked seats'),
        422: errorResponse('Validation failed'),
      },
    },

    delete: {
      tags: ['Rides'],
      summary: 'Cancel a ride you own',
      description:
        'Soft cancel: the document is retained with `status: "cancelled"` and `cancelledAt` for audit. Idempotent.',
      operationId: 'cancelRide',
      security: [{ bearerAuth: [] }],
      parameters: [pathIdParameter()],
      responses: {
        204: { description: 'Ride cancelled' },
        401: errorResponse('Missing or invalid token'),
        403: errorResponse('You do not own this ride'),
        404: errorResponse('Ride not found'),
        409: errorResponse('Completed rides cannot be cancelled'),
      },
    },
  },
} as const;

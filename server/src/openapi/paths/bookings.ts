import { env } from '../../config/env.js';
import { listBookingsQuerySchema } from '../../modules/bookings/booking.schemas.js';
import {
  errorResponse,
  jsonBody,
  objectIdParameter,
  paginatedEnvelope,
  queryParameters,
  successEnvelope,
} from '../registry.js';

const prefix = `${env.API_PREFIX}/bookings`;

export const bookingPaths = {
  [`${env.API_PREFIX}/rides/{rideId}/bookings`]: {
    post: {
      tags: ['Bookings'],
      summary: 'Book seats on a ride',
      description: [
        'Protected. Reserves `seats` on a published ride and creates a `pending` booking.',
        '',
        '**Atomic reservation.** The capacity guard is a single conditional',
        '`findOneAndUpdate` with `seatsAvailable: { $gte: seats }`; MongoDB serialises',
        'writes to the document, so when several riders race for the last seats exactly',
        'the winners succeed. Losing requests receive `409` and reserve nothing.',
        '',
        'The booking row is inserted *after* the reservation. If the insert fails (for',
        'example the unique active-booking index rejects a duplicate), the service runs a',
        'compensating `releaseSeats` so capacity is never leaked.',
        '',
        'A rider may hold at most one **active** booking per ride. Cancelling frees the',
        '`(rideId, riderId)` pair, so re-booking the same ride is allowed.',
      ].join('\n'),
      operationId: 'createBooking',
      security: [{ bearerAuth: [] }],
      parameters: [objectIdParameter('rideId', 'Ride to book')],
      requestBody: jsonBody('CreateBookingInput', { seats: 1 }),
      responses: {
        201: successEnvelope('Booking', 'Seats reserved and booking created'),
        401: errorResponse('Missing or invalid token'),
        404: errorResponse('Ride not found'),
        409: errorResponse(
          'Ride cancelled/completed/departed, own ride, duplicate active booking, or not enough seats',
        ),
        422: errorResponse('Invalid rideId or seat count'),
        429: errorResponse('Rate limit exceeded'),
      },
    },
  },

  [prefix]: {
    get: {
      tags: ['Bookings'],
      summary: 'List my bookings (as rider)',
      description: 'Protected. Returns bookings made by the caller, newest first.',
      operationId: 'listMyBookings',
      security: [{ bearerAuth: [] }],
      parameters: queryParameters(listBookingsQuerySchema),
      responses: {
        200: paginatedEnvelope('Booking', 'Paginated rider bookings'),
        401: errorResponse('Missing or invalid token'),
      },
    },
  },

  [`${prefix}/received`]: {
    get: {
      tags: ['Bookings'],
      summary: 'List bookings received (as driver)',
      description: [
        'Protected. Returns bookings for rides the caller drives, newest first.',
        'Each item includes the rider card and a ride summary so the dashboard needs one request.',
      ].join('\n'),
      operationId: 'listReceivedBookings',
      security: [{ bearerAuth: [] }],
      parameters: queryParameters(listBookingsQuerySchema),
      responses: {
        200: paginatedEnvelope('Booking', 'Paginated bookings received by the driver'),
        401: errorResponse('Missing or invalid token'),
      },
    },
  },

  [`${prefix}/{id}`]: {
    get: {
      tags: ['Bookings'],
      summary: 'Get a booking',
      description: 'Protected. Visible to the rider, the driver, and admins.',
      operationId: 'getBooking',
      security: [{ bearerAuth: [] }],
      parameters: [objectIdParameter('id', 'Booking id')],
      responses: {
        200: successEnvelope('Booking', 'Booking detail'),
        401: errorResponse('Missing or invalid token'),
        403: errorResponse('Caller is not part of this booking'),
        404: errorResponse('Booking not found'),
      },
    },
  },

  [`${prefix}/{id}/confirm`]: {
    post: {
      tags: ['Bookings'],
      summary: 'Confirm a booking (driver)',
      description: [
        'Protected. Only the ride driver (or an admin) can confirm.',
        'The `pending -> confirmed` transition is atomic and idempotent: repeating the',
        'call returns the already-confirmed booking instead of an error.',
      ].join('\n'),
      operationId: 'confirmBooking',
      security: [{ bearerAuth: [] }],
      parameters: [objectIdParameter('id', 'Booking id')],
      responses: {
        200: successEnvelope('Booking', 'Booking confirmed'),
        401: errorResponse('Missing or invalid token'),
        403: errorResponse('Caller is not the ride driver'),
        404: errorResponse('Booking not found'),
        409: errorResponse('Booking is cancelled or completed'),
      },
    },
  },

  [`${prefix}/{id}/cancel`]: {
    post: {
      tags: ['Bookings'],
      summary: 'Cancel a booking (either party)',
      description: [
        'Protected. The rider or the driver (or an admin) may cancel.',
        '',
        '**Atomic compensation.** The `pending|confirmed -> cancelled` transition is a',
        'single conditional update; only the request that wins the transition restores',
        'seats, so two concurrent cancels release the seats exactly once. The release is',
        'clamped at `seatsTotal`, and repeat calls are idempotent.',
        '',
        'The optional `reason` is stored for audit.',
      ].join('\n'),
      operationId: 'cancelBooking',
      security: [{ bearerAuth: [] }],
      parameters: [objectIdParameter('id', 'Booking id')],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CancelBookingInput' },
            example: { reason: 'Plans changed' },
          },
        },
      },
      responses: {
        200: successEnvelope('Booking', 'Booking cancelled and seats restored'),
        401: errorResponse('Missing or invalid token'),
        403: errorResponse('Caller is not the rider or driver'),
        404: errorResponse('Booking not found'),
        409: errorResponse('Booking is completed'),
      },
    },
  },
} as const;

import { z } from 'zod';
import { BOOKING_STATUSES, RIDE_STATUSES } from '../../config/constants.js';

const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'must be a 24 character hex ObjectId');

export const createBookingSchema = z.strictObject({
  seats: z.number().int().min(1).max(8).default(1),
});

export const cancelBookingSchema = z
  .strictObject({
    reason: z.string().min(1).max(280).optional(),
  })
  .default({});

export const listBookingsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(BOOKING_STATUSES).optional(),
});

export const bookingIdParamSchema = z.strictObject({
  id: objectIdSchema,
});

export const rideBookingParamSchema = z.strictObject({
  rideId: objectIdSchema,
});

const geoPointResponseSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]),
});

/** Rider card exposed to the driver on "bookings received". */
export const bookingRiderSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
});

/** Ride card embedded in a booking so the dashboard needs one request. */
export const bookingRideSummarySchema = z.object({
  id: z.string(),
  origin: geoPointResponseSchema,
  destination: geoPointResponseSchema,
  originAddress: z.string().optional(),
  destinationAddress: z.string().optional(),
  departureAt: z.string(),
  status: z.enum(RIDE_STATUSES),
  farePerSeat: z.number(),
  seatsTotal: z.number(),
  seatsAvailable: z.number(),
});

export const bookingResponseSchema = z.object({
  id: z.string(),
  rideId: z.string(),
  riderId: z.string(),
  driverId: z.string(),
  seats: z.number(),
  farePerSeat: z.number(),
  totalFare: z.number(),
  rideDepartureAt: z.string(),
  status: z.enum(BOOKING_STATUSES),
  rider: bookingRiderSchema.optional(),
  ride: bookingRideSummarySchema.optional(),
  confirmedAt: z.string().optional(),
  cancelledAt: z.string().optional(),
  cancellationReason: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
export type BookingResponse = z.infer<typeof bookingResponseSchema>;

import { z } from 'zod';
import { RIDE_REQUEST_STATUSES } from '../../config/constants.js';
import { haversineMeters, toGeoPoint } from '../../lib/geo.js';
import { pointInputSchema } from '../rides/ride.schemas.js';

const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'must be a 24 character hex ObjectId');

/** Two points closer than this are not a commute. */
const MIN_ROUTE_LENGTH_METERS = 25;

export const createRideRequestSchema = z
  .strictObject({
    origin: pointInputSchema,
    destination: pointInputSchema,
    originAddress: z.string().min(3).max(160).optional(),
    destinationAddress: z.string().min(3).max(160).optional(),
    departureAt: z.iso.datetime({ offset: true }),
    flexMinutes: z.number().int().min(1).max(240).default(30),
    seats: z.number().int().min(1).max(8).default(1),
    maxFarePerSeat: z.number().min(0).max(10_000).optional(),
    notes: z.string().min(1).max(280).optional(),
  })
  .refine((value) => Date.parse(value.departureAt) > Date.now() + 60_000, {
    path: ['departureAt'],
    message: 'departureAt must be at least one minute in the future',
  })
  .refine(
    (value) =>
      haversineMeters(
        toGeoPoint(value.origin.coordinates[0], value.origin.coordinates[1]),
        toGeoPoint(value.destination.coordinates[0], value.destination.coordinates[1]),
      ) >= MIN_ROUTE_LENGTH_METERS,
    {
      path: ['destination'],
      message: `destination must be at least ${MIN_ROUTE_LENGTH_METERS}m from origin`,
    },
  );

export const RIDE_REQUEST_SORTS = [
  'departureAt',
  '-departureAt',
  'createdAt',
  '-createdAt',
] as const;

export const listRideRequestsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(RIDE_REQUEST_STATUSES).optional(),
  departureAfter: z.iso.datetime({ offset: true }).optional(),
  departureBefore: z.iso.datetime({ offset: true }).optional(),
  seats: z.coerce.number().int().min(1).max(8).optional(),
  /** `lng,lat` - when present results are distance-ordered from this point. */
  near: z
    .string()
    .regex(/^-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?$/, 'near must be "lng,lat"')
    .optional(),
  radiusMeters: z.coerce.number().int().min(100).max(50_000).default(5_000),
  sort: z.enum(RIDE_REQUEST_SORTS).optional(),
});

/**
 * Reverse matching starts from one of the driver's rides. The rider's own
 * `flexMinutes` is used as the time tolerance, so a request that says
 * "±15 minutes" is not matched against a ride two hours away.
 */
export const reverseMatchQuerySchema = z.strictObject({
  rideId: objectIdSchema,
  pickupRadiusMeters: z.coerce.number().int().min(100).max(20_000).default(2_000),
  dropoffRadiusMeters: z.coerce.number().int().min(100).max(20_000).default(2_000),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const rideRequestIdParamSchema = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{24}$/i, 'id must be a 24 character hex ObjectId'),
});

/** Response contract, also reused by the OpenAPI document. */
export const rideRequestResponseSchema = z.object({
  id: z.string(),
  riderId: z.string(),
  origin: z.object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  destination: z.object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  originAddress: z.string().optional(),
  destinationAddress: z.string().optional(),
  departureAt: z.string(),
  flexMinutes: z.number(),
  seats: z.number(),
  maxFarePerSeat: z.number().optional(),
  notes: z.string().optional(),
  status: z.enum(RIDE_REQUEST_STATUSES),
  matchedRideId: z.string().optional(),
  distanceMeters: z.number().optional(),
  cancelledAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const rideRequestReverseMetaSchema = z.object({
  rideId: z.string(),
  candidates: z.number().int().min(0),
  returned: z.number().int().min(0),
});

export type CreateRideRequestInput = z.infer<typeof createRideRequestSchema>;
export type ListRideRequestsQuery = z.infer<typeof listRideRequestsQuerySchema>;
export type ReverseMatchQuery = z.infer<typeof reverseMatchQuerySchema>;
export type RideRequestResponse = z.infer<typeof rideRequestResponseSchema>;
export type RideRequestReverseMeta = z.infer<typeof rideRequestReverseMetaSchema>;

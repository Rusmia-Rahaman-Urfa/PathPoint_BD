import { z } from 'zod';
import { BD_BOUNDS, RIDE_STATUSES } from '../../config/constants.js';

/**
 * GeoJSON Point. Longitude and latitude are validated independently so the
 * error path is precise (`coordinates.0`) and the OpenAPI schema carries real
 * min/max bounds instead of a free-form array.
 */
export const pointInputSchema = z
  .strictObject({
    type: z.literal('Point').default('Point'),
    coordinates: z.tuple([
      z
        .number()
        .min(BD_BOUNDS.minLng, `Longitude must be >= ${BD_BOUNDS.minLng}`)
        .max(BD_BOUNDS.maxLng, `Longitude must be <= ${BD_BOUNDS.maxLng}`),
      z
        .number()
        .min(BD_BOUNDS.minLat, `Latitude must be >= ${BD_BOUNDS.minLat}`)
        .max(BD_BOUNDS.maxLat, `Latitude must be <= ${BD_BOUNDS.maxLat}`),
    ]),
  })
  .describe('GeoJSON Point as [longitude, latitude] within Bangladesh');

export const vehicleInputSchema = z.strictObject({
  make: z.string().min(1).max(40),
  model: z.string().min(1).max(40),
  plate: z
    .string()
    .min(4)
    .max(32)
    .regex(/^[A-Za-z0-9 -]+$/, 'Plate may only contain letters, digits, spaces and dashes'),
  ac: z.boolean().default(false),
});

export const preferencesInputSchema = z.strictObject({
  genderPreference: z.enum(['any', 'female', 'male']).default('any'),
  maxDetourMeters: z.number().int().min(0).max(20_000).default(3_000),
});

/** Shared field set - update derives from it with `.partial()`. */
const rideFields = {
  origin: pointInputSchema,
  destination: pointInputSchema,
  originAddress: z.string().min(3).max(160).optional(),
  destinationAddress: z.string().min(3).max(160).optional(),
  departureAt: z.iso.datetime({ offset: true }),
  seatsTotal: z.number().int().min(1).max(8),
  farePerSeat: z.number().min(0).max(10_000),
  vehicle: vehicleInputSchema.optional(),
  preferences: preferencesInputSchema.optional(),
  status: z.enum(['draft', 'published']).optional(),
};

const departureInFuture = (value: { departureAt?: string }): boolean =>
  value.departureAt === undefined || Date.parse(value.departureAt) > Date.now() + 60_000;

export const createRideSchema = z
  .strictObject(rideFields)
  .refine(departureInFuture, {
    path: ['departureAt'],
    message: 'departureAt must be at least one minute in the future',
  });

export const updateRideSchema = z
  .strictObject({
    origin: pointInputSchema.optional(),
    destination: pointInputSchema.optional(),
    originAddress: z.string().min(3).max(160).optional(),
    destinationAddress: z.string().min(3).max(160).optional(),
    departureAt: z.iso.datetime({ offset: true }).optional(),
    seatsTotal: z.number().int().min(1).max(8).optional(),
    farePerSeat: z.number().min(0).max(10_000).optional(),
    vehicle: vehicleInputSchema.optional(),
    preferences: preferencesInputSchema.optional(),
    status: z.enum(['draft', 'published']).optional(),
  })
  .refine(departureInFuture, {
    path: ['departureAt'],
    message: 'departureAt must be at least one minute in the future',
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const rideIdParamSchema = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{24}$/i, 'id must be a 24 character hex ObjectId'),
});

export const RIDE_SORTS = [
  'departureAt',
  '-departureAt',
  'createdAt',
  '-createdAt',
  'farePerSeat',
  '-farePerSeat',
] as const;

export const listRidesQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(RIDE_STATUSES).optional(),
  driverId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, 'driverId must be a 24 character hex ObjectId')
    .optional(),
  dateFrom: z.iso.datetime({ offset: true }).optional(),
  dateTo: z.iso.datetime({ offset: true }).optional(),
  /** `lng,lat` - when present the list is ordered by distance from this point. */
  near: z
    .string()
    .regex(/^-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?$/, 'near must be "lng,lat"')
    .optional(),
  radiusMeters: z.coerce.number().int().min(100).max(50_000).default(5_000),
  sort: z.enum(RIDE_SORTS).optional(),
});

export type CreateRideInput = z.infer<typeof createRideSchema>;
export type UpdateRideInput = z.infer<typeof updateRideSchema>;
export type ListRidesQuery = z.infer<typeof listRidesQuerySchema>;

/** Response contract, also reused by the OpenAPI document. */
export const rideResponseSchema = z.object({
  id: z.string(),
  driverId: z.string(),
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
  seatsTotal: z.number(),
  seatsAvailable: z.number(),
  farePerSeat: z.number(),
  vehicle: z
    .object({ make: z.string(), model: z.string(), plate: z.string(), ac: z.boolean() })
    .optional(),
  preferences: z.object({
    genderPreference: z.enum(['any', 'female', 'male']),
    maxDetourMeters: z.number(),
  }),
  status: z.enum(RIDE_STATUSES),
  distanceMeters: z.number().optional(),
  cancelledAt: z.string().optional(),
  cancellationReason: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RideResponse = z.infer<typeof rideResponseSchema>;

import { z } from 'zod';
import { haversineMeters, toGeoPoint } from '../../lib/geo.js';
import { pointInputSchema, rideResponseSchema } from '../rides/ride.schemas.js';

const pointResponseSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]),
});

const MIN_ROUTE_LENGTH_METERS = 10;

/**
 * A commuter search request.
 *
 * `departureAt` is the preferred departure and `flexMinutes` turns it into the
 * hard search window `[departureAt - flex, departureAt + flex]`. Keeping one
 * anchor instead of two free-form bounds is what makes the time-fit score
 * meaningful ("how close to my preferred time is this ride?").
 */
export const matchSearchSchema = z
  .strictObject({
    origin: pointInputSchema,
    destination: pointInputSchema,
    departureAt: z.iso.datetime({ offset: true }),
    flexMinutes: z.number().int().min(1).max(240).default(30),
    seats: z.number().int().min(1).max(8).default(1),
    pickupRadiusMeters: z.number().int().min(100).max(20_000).default(2_000),
    dropoffRadiusMeters: z.number().int().min(100).max(20_000).default(2_000),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .refine(
    (value) => {
      const origin = toGeoPoint(value.origin.coordinates[0], value.origin.coordinates[1]);
      const destination = toGeoPoint(
        value.destination.coordinates[0],
        value.destination.coordinates[1],
      );
      return haversineMeters(origin, destination) >= MIN_ROUTE_LENGTH_METERS;
    },
    {
      path: ['destination'],
      message: `origin and destination must be at least ${MIN_ROUTE_LENGTH_METERS} metres apart`,
    },
  )
  .refine(
    (value) => Date.parse(value.departureAt) + value.flexMinutes * 60_000 > Date.now(),
    {
      path: ['departureAt'],
      message: 'departureAt + flexMinutes must be in the future',
    },
  );

export type MatchSearchInput = z.infer<typeof matchSearchSchema>;

/**
 * Response contract. The score breakdown is part of the public API on purpose:
 * a commuter can see exactly why a ride ranked where it did.
 *
 * Note on weights: the four requested factors total 90 points, so a 10-point
 * availability factor (free-seat ratio) completes the 0-100 scale. Every
 * component exposes both `points` and `max`, making the arithmetic auditable.
 */
export const matchBreakdownSchema = z.object({
  pickup: z.object({
    points: z.number().min(0).max(30),
    max: z.literal(30),
    distanceMeters: z.number().min(0),
    radiusMeters: z.number().min(0),
  }),
  dropoff: z.object({
    points: z.number().min(0).max(25),
    max: z.literal(25),
    distanceMeters: z.number().min(0),
    radiusMeters: z.number().min(0),
  }),
  time: z.object({
    points: z.number().min(0).max(20),
    max: z.literal(20),
    deltaMinutes: z.number().min(0),
    flexMinutes: z.number().min(0),
  }),
  bearing: z.object({
    points: z.number().min(0).max(15),
    max: z.literal(15),
    deltaDegrees: z.number().min(0).max(180),
    maxDeltaDegrees: z.number().min(0).max(180),
  }),
  availability: z.object({
    points: z.number().min(0).max(10),
    max: z.literal(10),
    seatsAvailable: z.number().int().min(0),
    seatsTotal: z.number().int().min(0),
    seatsRequested: z.number().int().min(1),
  }),
});

export const matchCardSchema = z.object({
  ride: rideResponseSchema,
  score: z.number().min(0).max(100),
  breakdown: matchBreakdownSchema,
});

export const matchQueryEchoSchema = z.object({
  origin: pointResponseSchema,
  destination: pointResponseSchema,
  departureAt: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  flexMinutes: z.number(),
  seats: z.number(),
  pickupRadiusMeters: z.number(),
  dropoffRadiusMeters: z.number(),
});

export const matchSearchResultSchema = z.object({
  query: matchQueryEchoSchema,
  matches: z.array(matchCardSchema),
});

export const matchSearchMetaSchema = z.object({
  candidates: z.number().int().min(0),
  rejectedBearing: z.number().int().min(0),
  returned: z.number().int().min(0),
});

export type MatchBreakdown = z.infer<typeof matchBreakdownSchema>;
export type MatchCard = z.infer<typeof matchCardSchema>;
export type MatchQueryEcho = z.infer<typeof matchQueryEchoSchema>;
export type MatchSearchResult = z.infer<typeof matchSearchResultSchema>;
export type MatchSearchMeta = z.infer<typeof matchSearchMetaSchema>;

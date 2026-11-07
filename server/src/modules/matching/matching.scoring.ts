import { bearingDeltaDegrees } from '../../lib/geo.js';
import type { MatchBreakdown } from './matching.schemas.js';

/**
 * Score weights. They sum to 100:
 *   pickup 30 + dropoff 25 + time 20 + bearing 15 + availability 10.
 *
 * The four requested factors total 90, so availability (the ratio of free
 * seats) completes the 0-100 scale. It is deliberately small: it should break
 * ties between otherwise similar rides, not overpower route quality.
 */
export const SCORE_WEIGHTS = {
  pickup: 30,
  dropoff: 25,
  time: 20,
  bearing: 15,
  availability: 10,
} as const;

export const MAX_BEARING_DELTA_DEGREES = 60;

export interface ScoreCandidateInput {
  pickupDistanceMeters: number;
  dropoffDistanceMeters: number;
  pickupRadiusMeters: number;
  dropoffRadiusMeters: number;
  departureAt: Date;
  preferredDepartureAt: Date;
  flexMinutes: number;
  rideBearing: number;
  requestBearing: number;
  seatsAvailable: number;
  seatsTotal: number;
  seatsRequested: number;
}

export interface ScoreCandidateResult {
  score: number;
  breakdown: MatchBreakdown;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Pure scoring function - no Mongo, no Express, no clock. Returns `null` when
 * the candidate is travelling in a materially different direction; the caller
 * counts those as `rejectedBearing` rather than silently dropping them.
 */
export function scoreCandidate(input: ScoreCandidateInput): ScoreCandidateResult | null {
  const deltaDegrees = bearingDeltaDegrees(input.rideBearing, input.requestBearing);

  // A ride heading more than 60 degrees off the commuter's direction is not a
  // commute match at all (it is a different trip that happens to be nearby).
  if (deltaDegrees > MAX_BEARING_DELTA_DEGREES) {
    return null;
  }

  const pickupRatio =
    input.pickupRadiusMeters > 0
      ? clamp01(1 - input.pickupDistanceMeters / input.pickupRadiusMeters)
      : 0;

  const dropoffRatio =
    input.dropoffRadiusMeters > 0
      ? clamp01(1 - input.dropoffDistanceMeters / input.dropoffRadiusMeters)
      : 0;

  const deltaMinutes =
    Math.abs(input.departureAt.getTime() - input.preferredDepartureAt.getTime()) / 60_000;
  const timeRatio =
    input.flexMinutes > 0 ? clamp01(1 - deltaMinutes / input.flexMinutes) : 0;

  const bearingRatio = clamp01(1 - deltaDegrees / MAX_BEARING_DELTA_DEGREES);

  const availabilityRatio =
    input.seatsTotal > 0 ? clamp01(input.seatsAvailable / input.seatsTotal) : 0;

  const breakdown: MatchBreakdown = {
    pickup: {
      points: round1(SCORE_WEIGHTS.pickup * pickupRatio),
      max: SCORE_WEIGHTS.pickup,
      distanceMeters: round1(input.pickupDistanceMeters),
      radiusMeters: input.pickupRadiusMeters,
    },
    dropoff: {
      points: round1(SCORE_WEIGHTS.dropoff * dropoffRatio),
      max: SCORE_WEIGHTS.dropoff,
      distanceMeters: round1(input.dropoffDistanceMeters),
      radiusMeters: input.dropoffRadiusMeters,
    },
    time: {
      points: round1(SCORE_WEIGHTS.time * timeRatio),
      max: SCORE_WEIGHTS.time,
      deltaMinutes: round1(deltaMinutes),
      flexMinutes: input.flexMinutes,
    },
    bearing: {
      points: round1(SCORE_WEIGHTS.bearing * bearingRatio),
      max: SCORE_WEIGHTS.bearing,
      deltaDegrees: round1(deltaDegrees),
      maxDeltaDegrees: MAX_BEARING_DELTA_DEGREES,
    },
    availability: {
      points: round1(SCORE_WEIGHTS.availability * availabilityRatio),
      max: SCORE_WEIGHTS.availability,
      seatsAvailable: input.seatsAvailable,
      seatsTotal: input.seatsTotal,
      seatsRequested: input.seatsRequested,
    },
  };

  const score = round1(
    breakdown.pickup.points +
      breakdown.dropoff.points +
      breakdown.time.points +
      breakdown.bearing.points +
      breakdown.availability.points,
  );

  return { score, breakdown };
}

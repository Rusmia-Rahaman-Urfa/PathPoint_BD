import { ApiError } from '../../lib/ApiError.js';
import {
  haversineMeters,
  initialBearingDegrees,
  toGeoPoint,
  type GeoPoint,
} from '../../lib/geo.js';
import { toRideResponse } from '../rides/ride.mapper.js';
import { rideService, type RideActor } from '../rides/ride.service.js';
import { scoreCandidate } from './matching.scoring.js';
import type {
  MatchCard,
  MatchQueryEcho,
  MatchSearchInput,
  MatchSearchMeta,
  MatchSearchResult,
} from './matching.schemas.js';

/** Fetch more candidates than requested so scoring, not geo order, decides. */
const CANDIDATE_MULTIPLIER = 5;
const MAX_CANDIDATE_CAP = 250;

export interface MatchSearchResponse extends MatchSearchResult {
  meta: MatchSearchMeta;
}

export const matchingService = {
  async search(input: MatchSearchInput, actor: RideActor): Promise<MatchSearchResponse> {
    const preferredDepartureAt = new Date(input.departureAt);
    const windowStart = new Date(
      preferredDepartureAt.getTime() - input.flexMinutes * 60_000,
    );
    const windowEnd = new Date(preferredDepartureAt.getTime() + input.flexMinutes * 60_000);

    if (windowEnd.getTime() <= Date.now()) {
      throw ApiError.validation('The search window is entirely in the past', [
        {
          path: 'departureAt',
          message: 'departureAt + flexMinutes must be in the future',
        },
      ]);
    }

    const origin = toGeoPoint(input.origin.coordinates[0], input.origin.coordinates[1]);
    const destination = toGeoPoint(
      input.destination.coordinates[0],
      input.destination.coordinates[1],
    );

    const candidateLimit = Math.min(input.limit * CANDIDATE_MULTIPLIER, MAX_CANDIDATE_CAP);

    // Hard filters live in Mongo: published, enough seats, inside the time
    // window, not the requester's own ride, pickup within radius, and dropoff
    // within tolerance of the requested destination.
    const candidates = await rideService.findMatchCandidates({
      requesterId: actor.id,
      origin,
      destination,
      pickupRadiusMeters: input.pickupRadiusMeters,
      dropoffRadiusMeters: input.dropoffRadiusMeters,
      seats: input.seats,
      windowStart,
      windowEnd,
      candidateLimit,
    });

    const requestBearing = initialBearingDegrees(origin, destination);

    const matches: MatchCard[] = [];
    let rejectedBearing = 0;

    for (const candidate of candidates) {
      const rideDestination = candidate.destination as GeoPoint;
      const dropoffDistanceMeters = haversineMeters(destination, rideDestination);

      // `$geoWithin` already enforced this; the guard protects against any
      // future change to the query without silently corrupting the score.
      if (dropoffDistanceMeters > input.dropoffRadiusMeters + 1) continue;

      const scored = scoreCandidate({
        pickupDistanceMeters: candidate.pickupDistanceMeters,
        dropoffDistanceMeters,
        pickupRadiusMeters: input.pickupRadiusMeters,
        dropoffRadiusMeters: input.dropoffRadiusMeters,
        departureAt: candidate.departureAt,
        preferredDepartureAt,
        flexMinutes: input.flexMinutes,
        rideBearing: initialBearingDegrees(candidate.origin as GeoPoint, rideDestination),
        requestBearing,
        seatsAvailable: candidate.seatsAvailable,
        seatsTotal: candidate.seatsTotal,
        seatsRequested: input.seats,
      });

      if (!scored) {
        rejectedBearing += 1;
        continue;
      }

      matches.push({
        ride: toRideResponse(candidate, {
          distanceMeters: candidate.pickupDistanceMeters,
        }),
        score: scored.score,
        breakdown: scored.breakdown,
      });
    }

    // Highest score first. Ties break on the shorter walk to the pickup, then
    // on the earlier departure, so results are deterministic.
    matches.sort(
      (a, b) =>
        b.score - a.score ||
        a.breakdown.pickup.distanceMeters - b.breakdown.pickup.distanceMeters ||
        a.ride.departureAt.localeCompare(b.ride.departureAt),
    );

    const ranked = matches.slice(0, input.limit);

    const query: MatchQueryEcho = {
      origin,
      destination,
      departureAt: preferredDepartureAt.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      flexMinutes: input.flexMinutes,
      seats: input.seats,
      pickupRadiusMeters: input.pickupRadiusMeters,
      dropoffRadiusMeters: input.dropoffRadiusMeters,
    };

    return {
      query,
      matches: ranked,
      meta: {
        candidates: candidates.length,
        rejectedBearing,
        returned: ranked.length,
      },
    };
  },
};

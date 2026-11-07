import { Types } from 'mongoose';
import { ApiError } from '../../lib/ApiError.js';
import { isValidLngLat } from '../../lib/geo.js';
import { buildPaginationMeta, type PaginationMeta } from '../../lib/pagination.js';
import {
  assertCanManageRide,
  rideService,
  type RideActor,
} from '../rides/ride.service.js';
import { toRideRequestResponse } from './rideRequest.mapper.js';
import {
  rideRequestRepository,
  type RideRequestListItem,
  type RideRequestReverseCandidate,
  type RideRequestSort,
} from './rideRequest.repository.js';
import type { RideRequestRecord } from './rideRequest.model.js';
import type {
  CreateRideRequestInput,
  ListRideRequestsQuery,
  ReverseMatchQuery,
  RideRequestResponse,
  RideRequestReverseMeta,
} from './rideRequest.schemas.js';

export interface RideRequestListResult {
  items: RideRequestResponse[];
  meta: PaginationMeta;
}

export interface RideRequestReverseResult {
  items: RideRequestResponse[];
  meta: RideRequestReverseMeta;
}

function parseNear(
  near: string | undefined,
  radiusMeters: number,
): { lng: number; lat: number; radiusMeters: number } | undefined {
  if (!near) return undefined;

  const [lngRaw, latRaw] = near.split(',');
  const lng = Number(lngRaw);
  const lat = Number(latRaw);

  if (!isValidLngLat(lng, lat)) {
    throw ApiError.validation('near is outside Bangladesh', [
      { path: 'near', message: 'near must be "lng,lat" inside Bangladesh bounds' },
    ]);
  }

  return { lng, lat, radiusMeters };
}

function assertCanView(request: RideRequestRecord, actor: RideActor): void {
  const isOwner = String(request.riderId) === actor.id;
  if (!isOwner && actor.role !== 'admin') {
    throw ApiError.forbidden('You can only view your own ride requests');
  }
}

const mapItems = (items: RideRequestListItem[]): RideRequestResponse[] =>
  items.map((request) =>
    toRideRequestResponse(request, {
      ...(request.distanceMeters !== undefined ? { distanceMeters: request.distanceMeters } : {}),
    }),
  );

export const rideRequestService = {
  async create(input: CreateRideRequestInput, actor: RideActor): Promise<RideRequestResponse> {
    const request = await rideRequestRepository.create({
      riderId: new Types.ObjectId(actor.id),
      origin: { type: 'Point', coordinates: input.origin.coordinates },
      destination: { type: 'Point', coordinates: input.destination.coordinates },
      ...(input.originAddress ? { originAddress: input.originAddress } : {}),
      ...(input.destinationAddress ? { destinationAddress: input.destinationAddress } : {}),
      departureAt: new Date(input.departureAt),
      flexMinutes: input.flexMinutes,
      seats: input.seats,
      ...(input.maxFarePerSeat !== undefined ? { maxFarePerSeat: input.maxFarePerSeat } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      status: 'open',
    });

    return toRideRequestResponse(request);
  },

  async list(query: ListRideRequestsQuery): Promise<RideRequestListResult> {
    const near = parseNear(query.near, query.radiusMeters);
    const sort: RideRequestSort = query.sort ?? (near ? 'departureAt' : 'departureAt');

    const { items, total } = await rideRequestRepository.list({
      page: query.page,
      limit: query.limit,
      ...(query.status ? { status: query.status } : {}),
      ...(query.departureAfter ? { departureAfter: new Date(query.departureAfter) } : {}),
      ...(query.departureBefore ? { departureBefore: new Date(query.departureBefore) } : {}),
      ...(query.seats !== undefined ? { seats: query.seats } : {}),
      ...(near ? { near } : {}),
      sort,
    });

    return {
      items: mapItems(items),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  },

  async listMine(
    actor: RideActor,
    query: ListRideRequestsQuery,
  ): Promise<RideRequestListResult> {
    const near = parseNear(query.near, query.radiusMeters);

    const { items, total } = await rideRequestRepository.list({
      page: query.page,
      limit: query.limit,
      riderId: actor.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.departureAfter ? { departureAfter: new Date(query.departureAfter) } : {}),
      ...(query.departureBefore ? { departureBefore: new Date(query.departureBefore) } : {}),
      ...(query.seats !== undefined ? { seats: query.seats } : {}),
      ...(near ? { near } : {}),
      sort: query.sort ?? 'departureAt',
    });

    return {
      items: mapItems(items),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  },

  async getById(id: string, actor: RideActor): Promise<RideRequestResponse> {
    const request = await rideRequestRepository.findById(id);
    if (!request) {
      throw ApiError.notFound('Ride request not found');
    }
    assertCanView(request, actor);
    return toRideRequestResponse(request);
  },

  /**
   * Driver-facing reverse match. The caller must own (or administer) the ride;
   * a driver can never probe other drivers' rides for rider demand.
   */
  async findReverseMatches(
    query: ReverseMatchQuery,
    actor: RideActor,
  ): Promise<RideRequestReverseResult> {
    const ride = await rideService.getRecordById(query.rideId);
    assertCanManageRide(ride, actor);

    if (ride.status === 'cancelled') {
      throw ApiError.conflict('Cancelled rides cannot be matched');
    }
    if (ride.status === 'completed') {
      throw ApiError.conflict('Completed rides cannot be matched');
    }
    if (ride.status === 'draft') {
      throw ApiError.conflict('Publish the ride before looking for riders');
    }

    const candidates = await rideRequestRepository.findReverseMatches(
      ride,
      query.pickupRadiusMeters,
      query.dropoffRadiusMeters,
      query.limit,
    );

    return {
      items: candidates.map((request: RideRequestReverseCandidate) =>
        toRideRequestResponse(request, { distanceMeters: request.pickupDistanceMeters }),
      ),
      meta: {
        rideId: String(ride._id),
        candidates: candidates.length,
        returned: candidates.length,
      },
    };
  },

  /**
   * Soft cancel. The atomic transition decides the winner, so two concurrent
   * cancels cannot both run side effects.
   */
  async cancel(id: string, actor: RideActor): Promise<RideRequestResponse> {
    const request = await rideRequestRepository.findById(id);
    if (!request) {
      throw ApiError.notFound('Ride request not found');
    }
    assertCanView(request, actor);

    if (request.status === 'cancelled') {
      return toRideRequestResponse(request); // idempotent
    }
    if (request.status === 'matched') {
      throw ApiError.conflict('Matched requests cannot be cancelled here; cancel the booking instead');
    }
    if (request.status === 'expired') {
      throw ApiError.conflict('Expired requests cannot be cancelled');
    }

    const cancelled = await rideRequestRepository.cancel(id);
    if (!cancelled) {
      const current = await rideRequestRepository.findById(id);
      if (current?.status === 'cancelled') return toRideRequestResponse(current);
      throw ApiError.conflict('Ride request changed state, please retry');
    }

    return toRideRequestResponse(cancelled);
  },
};

import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import type { UserRole } from '../../config/constants.js';
import { ApiError } from '../../lib/ApiError.js';
import { isValidLngLat } from '../../lib/geo.js';
import { buildPaginationMeta, type PaginationMeta } from '../../lib/pagination.js';
import { toRideResponse } from './ride.mapper.js';
import { rideRepository, type RideMatchCandidate, type RideMatchCriteria, type RideSort } from './ride.repository.js';
import type { RideRecord } from './ride.model.js';
import type {
  CreateRideInput,
  ListRidesQuery,
  RideResponse,
  UpdateRideInput,
} from './ride.schemas.js';

export interface RideActor {
  id: string;
  role: UserRole;
}

export interface RideListResult {
  items: RideResponse[];
  meta: PaginationMeta;
}

const DEFAULT_MAX_DETOUR_METERS = 3_000;

/**
 * Ownership is enforced here - not in the controller and not in the query -
 * so every write path (HTTP today, workers or admin tooling tomorrow) goes
 * through the same check. Admins are the only exception.
 *
 * Exported because other modules (ride requests reverse matching) need the
 * exact same rule without duplicating it.
 */
export function assertCanManageRide(ride: RideRecord, actor: RideActor): void {
  const isOwner = String(ride.driverId) === actor.id;
  if (!isOwner && actor.role !== 'admin') {
    throw ApiError.forbidden('You can only modify rides you published');
  }
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

  return { lng, lat, radiusMeters: radiusMeters || env.GEO_DEFAULT_PICKUP_RADIUS_M };
}

export const rideService = {
  async create(input: CreateRideInput, actor: RideActor): Promise<RideResponse> {
    const ride = await rideRepository.create({
      driverId: new Types.ObjectId(actor.id),
      origin: { type: 'Point', coordinates: input.origin.coordinates },
      destination: { type: 'Point', coordinates: input.destination.coordinates },
      ...(input.originAddress ? { originAddress: input.originAddress } : {}),
      ...(input.destinationAddress ? { destinationAddress: input.destinationAddress } : {}),
      departureAt: new Date(input.departureAt),
      seatsTotal: input.seatsTotal,
      seatsAvailable: input.seatsTotal,
      farePerSeat: input.farePerSeat,
      ...(input.vehicle ? { vehicle: input.vehicle } : {}),
      preferences: input.preferences ?? {
        genderPreference: 'any',
        maxDetourMeters: DEFAULT_MAX_DETOUR_METERS,
      },
      status: input.status ?? 'published',
    });

    return toRideResponse(ride);
  },

  async getById(id: string): Promise<RideResponse> {
    const ride = await rideRepository.findById(id);
    if (!ride) {
      throw ApiError.notFound('Ride not found');
    }
    return toRideResponse(ride);
  },

  async list(query: ListRidesQuery): Promise<RideListResult> {
    const near = parseNear(query.near, query.radiusMeters);
    const sort: RideSort = near ? (query.sort ?? 'distanceMeters') : (query.sort ?? 'departureAt');

    const { items, total } = await rideRepository.list({
      page: query.page,
      limit: query.limit,
      ...(query.status ? { status: query.status } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.dateFrom ? { dateFrom: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { dateTo: new Date(query.dateTo) } : {}),
      ...(near ? { near } : {}),
      sort,
    });

    return {
      items: items.map((ride) =>
        toRideResponse(ride, {
          ...(ride.distanceMeters !== undefined ? { distanceMeters: ride.distanceMeters } : {}),
        }),
      ),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  },

  async listMine(actor: RideActor, query: ListRidesQuery): Promise<RideListResult> {
    return rideService.list({ ...query, driverId: actor.id });
  },

  async update(id: string, input: UpdateRideInput, actor: RideActor): Promise<RideResponse> {
    const ride = await rideRepository.findById(id);
    if (!ride) {
      throw ApiError.notFound('Ride not found');
    }
    assertCanManageRide(ride, actor);

    if (ride.status === 'cancelled') {
      throw ApiError.conflict('Cancelled rides cannot be edited');
    }
    if (ride.status === 'completed') {
      throw ApiError.conflict('Completed rides cannot be edited');
    }

    const patch: Record<string, unknown> = {};

    if (input.origin) patch.origin = { type: 'Point', coordinates: input.origin.coordinates };
    if (input.destination) {
      patch.destination = { type: 'Point', coordinates: input.destination.coordinates };
    }
    if (input.originAddress !== undefined) patch.originAddress = input.originAddress;
    if (input.destinationAddress !== undefined) {
      patch.destinationAddress = input.destinationAddress;
    }
    if (input.departureAt) patch.departureAt = new Date(input.departureAt);
    if (input.farePerSeat !== undefined) patch.farePerSeat = input.farePerSeat;
    if (input.vehicle !== undefined) patch.vehicle = input.vehicle;
    if (input.preferences !== undefined) patch.preferences = input.preferences;

    if (input.seatsTotal !== undefined) {
      const bookedSeats = ride.seatsTotal - ride.seatsAvailable;
      if (input.seatsTotal < bookedSeats) {
        throw ApiError.conflict(
          `seatsTotal cannot be lower than the ${bookedSeats} seat(s) already booked`,
        );
      }
      patch.seatsTotal = input.seatsTotal;
      patch.seatsAvailable = input.seatsTotal - bookedSeats;
    }

    if (input.status !== undefined) {
      if (input.status === 'published' && ride.seatsAvailable === 0) {
        throw ApiError.conflict('A ride with no available seats cannot be published');
      }
      patch.status = input.status;
    }

    const updated = await rideRepository.updateById(id, patch);
    if (!updated) {
      throw ApiError.notFound('Ride not found');
    }

    return toRideResponse(updated);
  },

  /** Soft cancel: history and audit trail are preserved, seats are not reused. */
  async cancel(id: string, actor: RideActor): Promise<void> {
    const ride = await rideRepository.findById(id);
    if (!ride) {
      throw ApiError.notFound('Ride not found');
    }
    assertCanManageRide(ride, actor);

    if (ride.status === 'cancelled') return; // idempotent
    if (ride.status === 'completed') {
      throw ApiError.conflict('Completed rides cannot be cancelled');
    }

    await rideRepository.cancel(id);
  },

  /**
   * Internal read model. Other modules need the full record (driver, geo,
   * capacity) to enforce their own invariants without duplicating a Mongo query.
   */
  async getRecordById(id: string): Promise<RideRecord> {
    const ride = await rideRepository.findById(id);
    if (!ride) {
      throw ApiError.notFound('Ride not found');
    }
    return ride;
  },

  /** Atomic capacity reservation - see `rideRepository.reserveSeats`. */
  async reserveSeats(id: string, seats: number): Promise<RideRecord | null> {
    return rideRepository.reserveSeats(id, seats);
  },

  /** Compensating capacity release - see `rideRepository.releaseSeats`. */
  async releaseSeats(id: string, seats: number): Promise<RideRecord | null> {
    return rideRepository.releaseSeats(id, seats);
  },

  /**
   * Read model for the matching module. Exposed through the service so the
   * matching service never talks to Mongo directly (service -> service).
   */
  async findMatchCandidates(criteria: RideMatchCriteria): Promise<RideMatchCandidate[]> {
    return rideRepository.findMatchCandidates(criteria);
  },
};

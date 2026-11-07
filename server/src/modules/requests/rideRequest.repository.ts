import { Types, trusted, type FilterQuery, type PipelineStage } from 'mongoose';
import { EARTH_RADIUS_METERS } from '../../lib/geo.js';
import type { RideRequestStatus } from '../../config/constants.js';
import type { RideRecord } from '../rides/ride.model.js';
import {
  RideRequestModel,
  type RideRequest,
  type RideRequestRecord,
} from './rideRequest.model.js';

export type RideRequestSort = 'departureAt' | '-departureAt' | 'createdAt' | '-createdAt';

export interface RideRequestListFilters {
  page: number;
  limit: number;
  status?: RideRequestStatus;
  riderId?: string;
  departureAfter?: Date;
  departureBefore?: Date;
  seats?: number;
  near?: { lng: number; lat: number; radiusMeters: number };
  sort: RideRequestSort;
}

export type RideRequestListItem = RideRequestRecord & { distanceMeters?: number };

export interface RideRequestListResult {
  items: RideRequestListItem[];
  total: number;
}

export type RideRequestReverseCandidate = RideRequestRecord & {
  pickupDistanceMeters: number;
};

const SORT_MAP: Record<RideRequestSort, Record<string, 1 | -1>> = {
  departureAt: { departureAt: 1 },
  '-departureAt': { departureAt: -1 },
  createdAt: { createdAt: 1 },
  '-createdAt': { createdAt: -1 },
};

function buildFilter(filters: RideRequestListFilters): FilterQuery<RideRequest> {
  const filter: FilterQuery<RideRequest> = {};

  if (filters.status) filter.status = filters.status;
  if (filters.riderId) filter.riderId = new Types.ObjectId(filters.riderId);
  if (filters.seats !== undefined) filter.seats = trusted({ $lte: filters.seats });

  if (filters.departureAfter || filters.departureBefore) {
    // `trusted` bypasses the global `sanitizeFilter`, which would otherwise
    // wrap this operator object in `$eq` and break the range.
    filter.departureAt = trusted({
      ...(filters.departureAfter ? { $gte: filters.departureAfter } : {}),
      ...(filters.departureBefore ? { $lte: filters.departureBefore } : {}),
    });
  }

  return filter;
}

export const rideRequestRepository = {
  async create(data: Partial<RideRequest>): Promise<RideRequestRecord> {
    const doc = await RideRequestModel.create(data);
    return doc.toObject() as unknown as RideRequestRecord;
  },

  async findById(id: string): Promise<RideRequestRecord | null> {
    return RideRequestModel.findById(id).lean<RideRequestRecord>();
  },

  async list(filters: RideRequestListFilters): Promise<RideRequestListResult> {
    const filter = buildFilter(filters);
    const skip = (filters.page - 1) * filters.limit;
    const sort = SORT_MAP[filters.sort];

    if (filters.near) {
      const pipeline: PipelineStage[] = [
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates: [filters.near.lng, filters.near.lat],
            },
            distanceField: 'distanceMeters',
            maxDistance: filters.near.radiusMeters,
            key: 'origin',
            query: filter,
            spherical: true,
          },
        },
        {
          $facet: {
            items: [
              { $sort: { distanceMeters: 1 } },
              { $skip: skip },
              { $limit: filters.limit },
            ],
            total: [{ $count: 'count' }],
          },
        },
      ];

      const [result] = await RideRequestModel.aggregate<{
        items: RideRequestListItem[];
        total: Array<{ count: number }>;
      }>(pipeline);

      return {
        items: result?.items ?? [],
        total: result?.total[0]?.count ?? 0,
      };
    }

    const [items, total] = await Promise.all([
      RideRequestModel.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(filters.limit)
        .lean<RideRequestListItem[]>(),
      RideRequestModel.countDocuments(filter),
    ]);

    return { items, total };
  },

  /**
   * Reverse matching: given a driver's ride, find riders whose intent fits.
   *
   * `$geoNear` (stage 1) uses the request `origin` index to find nearby
   * pickups; `$geoWithin` on `destination` adds the dropoff tolerance. The
   * time window is per-request (`$expr` with each document's own
   * `flexMinutes`), not a single global window, so "±15 min" really means 15.
   * Requests without a budget match any fare; requests with one must be able
   * to afford the ride.
   */
  async findReverseMatches(
    ride: RideRecord,
    pickupRadiusMeters: number,
    dropoffRadiusMeters: number,
    limit: number,
  ): Promise<RideRequestReverseCandidate[]> {
    const dropoffRadians = dropoffRadiusMeters / EARTH_RADIUS_METERS;

    const pipeline: PipelineStage[] = [
      {
        $geoNear: {
          near: ride.origin,
          distanceField: 'pickupDistanceMeters',
          maxDistance: pickupRadiusMeters,
          key: 'origin',
          spherical: true,
          query: {
            status: 'open',
            riderId: { $ne: new Types.ObjectId(String(ride.driverId)) },
            seats: { $lte: ride.seatsAvailable },
            destination: {
              $geoWithin: {
                $centerSphere: [ride.destination.coordinates, dropoffRadians],
              },
            },
            $expr: {
              $and: [
                {
                  $lte: [
                    { $abs: { $subtract: ['$departureAt', ride.departureAt] } },
                    { $multiply: ['$flexMinutes', 60_000] },
                  ],
                },
                {
                  $or: [
                    { $eq: [{ $type: '$maxFarePerSeat' }, 'missing'] },
                    { $gte: ['$maxFarePerSeat', ride.farePerSeat] },
                  ],
                },
              ],
            },
          },
        },
      },
      { $sort: { pickupDistanceMeters: 1 } },
      { $limit: limit },
    ];

    return RideRequestModel.aggregate<RideRequestReverseCandidate>(pipeline);
  },

  /**
   * Atomic state transition. Exactly one concurrent caller can move an open
   * request to cancelled; the loser receives `null` and therefore cannot run
   * side effects twice.
   */
  async cancel(id: string): Promise<RideRequestRecord | null> {
    return RideRequestModel.findOneAndUpdate(
      { _id: id, status: 'open' },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
      { new: true },
    ).lean<RideRequestRecord>();
  },

  async markMatched(id: string, rideId: string): Promise<RideRequestRecord | null> {
    return RideRequestModel.findOneAndUpdate(
      { _id: id, status: 'open' },
      { $set: { status: 'matched', matchedRideId: new Types.ObjectId(rideId) } },
      { new: true },
    ).lean<RideRequestRecord>();
  },
};

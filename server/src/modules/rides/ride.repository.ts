import { Types, trusted, type FilterQuery, type PipelineStage } from 'mongoose';
import { RideModel, type Ride, type RideRecord } from './ride.model.js';
import { EARTH_RADIUS_METERS, type GeoPoint } from '../../lib/geo.js';
import type { RideStatus } from '../../config/constants.js';

export interface RideListFilters {
  page: number;
  limit: number;
  status?: RideStatus;
  driverId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  near?: { lng: number; lat: number; radiusMeters: number };
  sort: RideSort;
}

export type RideSort =
  | 'departureAt'
  | '-departureAt'
  | 'createdAt'
  | '-createdAt'
  | 'farePerSeat'
  | '-farePerSeat'
  | 'distanceMeters';

const SORT_MAP: Record<RideSort, Record<string, 1 | -1>> = {
  departureAt: { departureAt: 1 },
  '-departureAt': { departureAt: -1 },
  createdAt: { createdAt: 1 },
  '-createdAt': { createdAt: -1 },
  farePerSeat: { farePerSeat: 1 },
  '-farePerSeat': { farePerSeat: -1 },
  distanceMeters: { distanceMeters: 1 },
};

export interface RideListResult {
  items: RideListItem[];
  total: number;
}

/** `distanceMeters` is only present when the query used `near`. */
export type RideListItem = RideRecord & { distanceMeters?: number };

/**
 * Criteria for the matching read model. Kept here (rather than in the matching
 * module) so every query over the Ride collection still lives in one place.
 */
export interface RideMatchCriteria {
  requesterId: string;
  origin: GeoPoint;
  destination: GeoPoint;
  pickupRadiusMeters: number;
  dropoffRadiusMeters: number;
  seats: number;
  windowStart: Date;
  windowEnd: Date;
  /** Safety valve: score at most this many nearest pickups in the service. */
  candidateLimit: number;
}

export type RideMatchCandidate = RideRecord & { pickupDistanceMeters: number };

function buildFilter(filters: RideListFilters): FilterQuery<Ride> {
  const filter: FilterQuery<Ride> = {};

  if (filters.status) filter.status = filters.status;
  if (filters.driverId) filter.driverId = new Types.ObjectId(filters.driverId);

  if (filters.dateFrom || filters.dateTo) {
    // `trusted` is required because `sanitizeFilter` is enabled globally: without
    // it Mongoose would wrap this operator object in `$eq` and the range breaks.
    filter.departureAt = trusted({
      ...(filters.dateFrom ? { $gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { $lte: filters.dateTo } : {}),
    });
  }

  return filter;
}

export const rideRepository = {
  async create(data: Partial<Ride>): Promise<RideRecord> {
    const doc = await RideModel.create(data);
    return doc.toObject() as unknown as RideRecord;
  },

  async findById(id: string): Promise<RideRecord | null> {
    return RideModel.findById(id).lean<RideRecord>();
  },

  async updateById(id: string, patch: Record<string, unknown>): Promise<RideRecord | null> {
    return RideModel.findByIdAndUpdate(
      id,
      { $set: patch },
      { new: true, runValidators: true },
    ).lean<RideRecord>();
  },

  async cancel(id: string, reason?: string): Promise<RideRecord | null> {
    return RideModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          ...(reason ? { cancellationReason: reason } : {}),
        },
      },
      { new: true, runValidators: true },
    ).lean<RideRecord>();
  },

  /**
   * Two query paths:
   *  - plain filters use `find` + `countDocuments` (index-backed);
   *  - `near` uses `$geoNear` (must be stage 1) + `$facet` so pagination and
   *    the total count stay correct while results are distance-ordered.
   */
  async list(filters: RideListFilters): Promise<RideListResult> {
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
            items: [{ $sort: sort }, { $skip: skip }, { $limit: filters.limit }],
            total: [{ $count: 'count' }],
          },
        },
      ];

      const [result] = await RideModel.aggregate<{
        items: RideListItem[];
        total: Array<{ count: number }>;
      }>(pipeline);

      return {
        items: result?.items ?? [],
        total: result?.total[0]?.count ?? 0,
      };
    }

    const [items, total] = await Promise.all([
      RideModel.find(filter).sort(sort).skip(skip).limit(filters.limit).lean<RideRecord[]>(),
      RideModel.countDocuments(filter),
    ]);

    return { items, total };
  },

  /**
   * Atomically reserves `seats` on a published ride.
   *
   * The `seatsAvailable >= seats` predicate is the entire concurrency guard:
   * MongoDB serialises writes to a single document, so when N requests race for
   * the last seats exactly the ones that still satisfy the filter succeed. The
   * aggregation-pipeline update also flips `status` to `full` in the same write,
   * so readers never observe "0 seats left but still published".
   *
   * Returns `null` when the ride is gone, no longer published, or has fewer than
   * `seats` free - the caller turns that into a 409 without a second read.
   */
  async reserveSeats(id: string, seats: number): Promise<RideRecord | null> {
    return RideModel.findOneAndUpdate(
      {
        _id: id,
        status: 'published',
        seatsAvailable: trusted({ $gte: seats }),
      },
      [
        { $set: { seatsAvailable: { $subtract: ['$seatsAvailable', seats] } } },
        {
          $set: {
            status: { $cond: [{ $eq: ['$seatsAvailable', 0] }, 'full', 'published'] },
          },
        },
      ],
      { new: true },
    ).lean<RideRecord>();
  },

  /**
   * Compensating write for a cancelled booking. Clamped at `seatsTotal` so a
   * duplicated call can never inflate capacity, and restricted to rides that
   * still hold seats (`published`/`full`) so cancelling a booking on an already
   * cancelled ride does not resurrect it.
   */
  async releaseSeats(id: string, seats: number): Promise<RideRecord | null> {
    return RideModel.findOneAndUpdate(
      { _id: id, status: trusted({ $in: ['published', 'full'] }) },
      [
        {
          $set: {
            seatsAvailable: {
              $min: [{ $add: ['$seatsAvailable', seats] }, '$seatsTotal'],
            },
          },
        },
        {
          $set: {
            status: { $cond: [{ $eq: ['$status', 'full'] }, 'published', '$status'] },
          },
        },
      ],
      { new: true },
    ).lean<RideRecord>();
  },

  /**
   * Core commute-matching pipeline.
   *
   * `$geoNear` (stage 1, mandatory) narrows the candidate set to rides whose
   * `origin` is within the pickup radius, and must therefore own the hard
   * filters. `$geoWithin` on `destination` adds the dropoff tolerance, so one
   * query simultaneously uses both 2dsphere indexes. Time window, status,
   * seats and driver exclusion are applied inside `$geoNear.query` so Mongo
   * never returns candidates the service would have to discard.
   *
   * Note: `sanitizeFilter` only rewrites Mongoose Query filters, not
   * aggregation pipelines; every value here is Zod-validated and typed.
   */
  async findMatchCandidates(criteria: RideMatchCriteria): Promise<RideMatchCandidate[]> {
    const dropoffRadians = criteria.dropoffRadiusMeters / EARTH_RADIUS_METERS;

    const pipeline: PipelineStage[] = [
      {
        $geoNear: {
          near: criteria.origin,
          distanceField: 'pickupDistanceMeters',
          maxDistance: criteria.pickupRadiusMeters,
          key: 'origin',
          spherical: true,
          query: {
            status: 'published',
            seatsAvailable: { $gte: criteria.seats },
            departureAt: { $gte: criteria.windowStart, $lte: criteria.windowEnd },
            driverId: { $ne: new Types.ObjectId(criteria.requesterId) },
            destination: {
              $geoWithin: {
                $centerSphere: [criteria.destination.coordinates, dropoffRadians],
              },
            },
          },
        },
      },
      // Nearest pickups first; scoring and ranking happen in the service.
      { $limit: criteria.candidateLimit },
    ];

    return RideModel.aggregate<RideMatchCandidate>(pipeline);
  },
};

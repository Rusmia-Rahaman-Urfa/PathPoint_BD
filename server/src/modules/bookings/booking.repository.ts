import { Types, trusted, type FilterQuery } from 'mongoose';
import type { BookingStatus, RideStatus } from '../../config/constants.js';
import type { GeoPoint } from '../../lib/geo.js';
import { BookingModel, type Booking, type BookingRecord } from './booking.model.js';

export interface BookingListFilters {
  page: number;
  limit: number;
  riderId?: string;
  driverId?: string;
  status?: BookingStatus;
}

export interface BookingListResult {
  items: BookingDetailRecord[];
  total: number;
}

export interface PopulatedRider {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
}

export interface PopulatedRide {
  _id: Types.ObjectId;
  origin: GeoPoint;
  destination: GeoPoint;
  originAddress?: string;
  destinationAddress?: string;
  departureAt: Date;
  status: RideStatus;
  farePerSeat: number;
  seatsTotal: number;
  seatsAvailable: number;
}

/** A booking whose refs may have been resolved by `populate`. */
export type BookingDetailRecord = Omit<BookingRecord, 'rideId' | 'riderId'> & {
  rideId: Types.ObjectId | PopulatedRide;
  riderId: Types.ObjectId | PopulatedRider;
};

const RIDER_FIELDS = 'name email phone';
const RIDE_FIELDS =
  'origin destination originAddress destinationAddress departureAt status farePerSeat seatsTotal seatsAvailable';

export const bookingRepository = {
  async create(data: Partial<Booking>): Promise<BookingRecord> {
    const doc = await BookingModel.create(data);
    return doc.toObject() as unknown as BookingRecord;
  },

  /** Raw record used for authorisation and seat arithmetic. */
  async findRawById(id: string): Promise<BookingRecord | null> {
    return BookingModel.findById(id).lean<BookingRecord>();
  },

  /** Hydrated view used for API responses (rider + ride cards). */
  async findById(id: string): Promise<BookingDetailRecord | null> {
    return BookingModel.findById(id)
      .populate('riderId', RIDER_FIELDS)
      .populate('rideId', RIDE_FIELDS)
      .lean<BookingDetailRecord>();
  },

  async findActiveByRideAndRider(
    rideId: string,
    riderId: string,
  ): Promise<BookingRecord | null> {
    return BookingModel.findOne({ rideId, riderId, active: true }).lean<BookingRecord>();
  },

  async list(filters: BookingListFilters): Promise<BookingListResult> {
    const filter: FilterQuery<Booking> = {};

    if (filters.riderId) filter.riderId = new Types.ObjectId(filters.riderId);
    if (filters.driverId) filter.driverId = new Types.ObjectId(filters.driverId);
    if (filters.status) filter.status = filters.status;

    const skip = (filters.page - 1) * filters.limit;

    const [items, total] = await Promise.all([
      BookingModel.find(filter)
        .populate('riderId', RIDER_FIELDS)
        .populate('rideId', RIDE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .lean<BookingDetailRecord[]>(),
      BookingModel.countDocuments(filter),
    ]);

    return { items, total };
  },

  /**
   * Atomic `pending -> confirmed`. Returns `null` if the booking was already
   * confirmed/cancelled by a concurrent request, so the caller can reload and
   * decide whether to return the current state or a conflict.
   */
  async confirm(id: string): Promise<BookingRecord | null> {
    return BookingModel.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { $set: { status: 'confirmed', confirmedAt: new Date() } },
      { new: true },
    ).lean<BookingRecord>();
  },

  /**
   * Atomic `pending|confirmed -> cancelled`. Only the winner of this transition
   * gets a document back; the service restores seats only for that winner, so a
   * double-cancel cannot inflate capacity.
   */
  async cancel(id: string, reason?: string): Promise<BookingRecord | null> {
    return BookingModel.findOneAndUpdate(
      { _id: id, status: trusted({ $in: ['pending', 'confirmed'] }) },
      {
        $set: {
          status: 'cancelled',
          active: false,
          cancelledAt: new Date(),
          ...(reason ? { cancellationReason: reason } : {}),
        },
      },
      { new: true },
    ).lean<BookingRecord>();
  },
};

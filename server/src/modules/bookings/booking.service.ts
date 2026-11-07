import { Types } from 'mongoose';
import { ApiError } from '../../lib/ApiError.js';
import { buildPaginationMeta, type PaginationMeta } from '../../lib/pagination.js';
import { rideService, type RideActor } from '../rides/ride.service.js';
import { toBookingResponse } from './booking.mapper.js';
import { bookingRepository } from './booking.repository.js';
import type { BookingRecord } from './booking.model.js';
import type {
  BookingResponse,
  CreateBookingInput,
  ListBookingsQuery,
} from './booking.schemas.js';

export interface BookingListResult {
  items: BookingResponse[];
  meta: PaginationMeta;
}

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: number }).code === 11000;

function assertCanView(booking: BookingRecord, actor: RideActor): void {
  const isRider = String(booking.riderId) === actor.id;
  const isDriver = String(booking.driverId) === actor.id;

  if (!isRider && !isDriver && actor.role !== 'admin') {
    throw ApiError.forbidden('You can only view bookings you are part of');
  }
}

const toDetail = async (id: string, fallback: BookingRecord): Promise<BookingResponse> => {
  const detailed = await bookingRepository.findById(id);
  return toBookingResponse(detailed ?? fallback);
};

export const bookingService = {
  /**
   * Atomic reservation flow:
   *   1. read the ride and validate business rules,
   *   2. pre-check for an existing active booking (fast, friendly 409),
   *   3. atomically reserve seats - this is the real concurrency guard,
   *   4. insert the booking; if the insert fails for any reason (including the
   *      unique partial index losing a same-rider race), compensate by
   *      releasing the seats before surfacing the error.
   *
   * The order matters: seats are reserved before the insert so a crash can
   * never leave a booking that holds no seats. The compensating release is the
   * mirror image.
   */
  async create(
    rideId: string,
    input: CreateBookingInput,
    actor: RideActor,
  ): Promise<BookingResponse> {
    const ride = await rideService.getRecordById(rideId);

    if (ride.status === 'cancelled') {
      throw ApiError.conflict('This ride has been cancelled');
    }
    if (ride.status === 'completed') {
      throw ApiError.conflict('This ride has already been completed');
    }
    if (ride.status === 'draft') {
      throw ApiError.conflict('This ride is not published yet');
    }
    if (String(ride.driverId) === actor.id) {
      throw ApiError.conflict('You cannot book your own ride');
    }
    if (ride.departureAt.getTime() <= Date.now()) {
      throw ApiError.conflict('This ride has already departed');
    }
    if (input.seats > ride.seatsAvailable) {
      throw ApiError.conflict(
        `Only ${ride.seatsAvailable} seat(s) available on this ride`,
      );
    }

    const existing = await bookingRepository.findActiveByRideAndRider(rideId, actor.id);
    if (existing) {
      throw ApiError.conflict('You already have an active booking for this ride');
    }

    const reserved = await rideService.reserveSeats(rideId, input.seats);
    if (!reserved) {
      // Lost the race for the last seats (or the ride left `published` between
      // our read and the update).
      throw ApiError.conflict('Not enough seats available, please retry');
    }

    try {
      const booking = await bookingRepository.create({
        rideId: new Types.ObjectId(rideId),
        riderId: new Types.ObjectId(actor.id),
        driverId: new Types.ObjectId(String(ride.driverId)),
        seats: input.seats,
        farePerSeat: ride.farePerSeat,
        totalFare: Math.round(ride.farePerSeat * input.seats * 100) / 100,
        rideDepartureAt: ride.departureAt,
        status: 'pending',
        active: true,
      });

      return await toDetail(String(booking._id), booking);
    } catch (error) {
      // Compensating write: the seats we reserved must go back.
      await rideService.releaseSeats(rideId, input.seats);

      if (isDuplicateKeyError(error)) {
        throw ApiError.conflict('You already have an active booking for this ride');
      }
      throw error;
    }
  },

  async listMine(actor: RideActor, query: ListBookingsQuery): Promise<BookingListResult> {
    const { items, total } = await bookingRepository.list({
      page: query.page,
      limit: query.limit,
      riderId: actor.id,
      ...(query.status ? { status: query.status } : {}),
    });

    return {
      items: items.map(toBookingResponse),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  },

  async listReceived(actor: RideActor, query: ListBookingsQuery): Promise<BookingListResult> {
    const { items, total } = await bookingRepository.list({
      page: query.page,
      limit: query.limit,
      driverId: actor.id,
      ...(query.status ? { status: query.status } : {}),
    });

    return {
      items: items.map(toBookingResponse),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  },

  async getById(id: string, actor: RideActor): Promise<BookingResponse> {
    const booking = await bookingRepository.findRawById(id);
    if (!booking) {
      throw ApiError.notFound('Booking not found');
    }
    assertCanView(booking, actor);

    const detailed = await bookingRepository.findById(id);
    return toBookingResponse(detailed ?? booking);
  },

  /** Driver action. Idempotent when the booking is already confirmed. */
  async confirm(id: string, actor: RideActor): Promise<BookingResponse> {
    const booking = await bookingRepository.findRawById(id);
    if (!booking) {
      throw ApiError.notFound('Booking not found');
    }

    const isDriver = String(booking.driverId) === actor.id;
    if (!isDriver && actor.role !== 'admin') {
      throw ApiError.forbidden('Only the ride driver can confirm this booking');
    }

    if (booking.status === 'confirmed') {
      return toDetail(id, booking);
    }
    if (booking.status === 'cancelled') {
      throw ApiError.conflict('Cancelled bookings cannot be confirmed');
    }
    if (booking.status === 'completed') {
      throw ApiError.conflict('Completed bookings cannot be confirmed');
    }

    const confirmed = await bookingRepository.confirm(id);
    if (!confirmed) {
      const current = await bookingRepository.findRawById(id);
      if (current?.status === 'confirmed') {
        return toDetail(id, current);
      }
      throw ApiError.conflict('Booking changed state, please retry');
    }

    return toDetail(id, confirmed);
  },

  /**
   * Either party may cancel. The atomic transition decides the winner; only the
   * winner restores seats, so two concurrent cancels release the seats once.
   */
  async cancel(
    id: string,
    actor: RideActor,
    reason?: string,
  ): Promise<BookingResponse> {
    const booking = await bookingRepository.findRawById(id);
    if (!booking) {
      throw ApiError.notFound('Booking not found');
    }

    const isRider = String(booking.riderId) === actor.id;
    const isDriver = String(booking.driverId) === actor.id;
    if (!isRider && !isDriver && actor.role !== 'admin') {
      throw ApiError.forbidden('Only the rider or the driver can cancel this booking');
    }

    if (booking.status === 'cancelled') {
      return toDetail(id, booking); // idempotent, no second seat release
    }
    if (booking.status === 'completed') {
      throw ApiError.conflict('Completed bookings cannot be cancelled');
    }

    const cancelled = await bookingRepository.cancel(id, reason);
    if (!cancelled) {
      const current = await bookingRepository.findRawById(id);
      if (current?.status === 'cancelled') {
        return toDetail(id, current);
      }
      throw ApiError.conflict('Booking changed state, please retry');
    }

    // Compensating write: restore exactly the seats this booking held. The
    // repository clamps at seatsTotal and ignores cancelled rides, so even a
    // duplicate call can never inflate capacity.
    await rideService.releaseSeats(String(booking.rideId), booking.seats);

    return toDetail(id, cancelled);
  },
};

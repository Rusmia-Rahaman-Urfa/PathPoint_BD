import type {
  BookingDetailRecord,
  PopulatedRide,
  PopulatedRider,
} from './booking.repository.js';
import type { BookingResponse } from './booking.schemas.js';

const isPopulatedRide = (value: unknown): value is PopulatedRide =>
  typeof value === 'object' &&
  value !== null &&
  'departureAt' in value &&
  'origin' in value;

const isPopulatedRider = (value: unknown): value is PopulatedRider =>
  typeof value === 'object' && value !== null && 'name' in value && 'email' in value;

/**
 * Explicit DTO boundary. `_id`, `__v`, `active` and other internal fields never
 * reach the client; populated refs are flattened into stable `rider` / `ride`
 * cards.
 */
export function toBookingResponse(booking: BookingDetailRecord): BookingResponse {
  const ride = isPopulatedRide(booking.rideId) ? booking.rideId : null;
  const rider = isPopulatedRider(booking.riderId) ? booking.riderId : null;

  return {
    id: String(booking._id),
    rideId: String(ride ? ride._id : booking.rideId),
    riderId: String(rider ? rider._id : booking.riderId),
    driverId: String(booking.driverId),
    seats: booking.seats,
    farePerSeat: booking.farePerSeat,
    totalFare: booking.totalFare,
    rideDepartureAt: booking.rideDepartureAt.toISOString(),
    status: booking.status,
    ...(rider
      ? {
          rider: {
            id: String(rider._id),
            name: rider.name,
            email: rider.email,
            ...(rider.phone ? { phone: rider.phone } : {}),
          },
        }
      : {}),
    ...(ride
      ? {
          ride: {
            id: String(ride._id),
            origin: {
              type: 'Point' as const,
              coordinates: [ride.origin.coordinates[0], ride.origin.coordinates[1]] as [
                number,
                number,
              ],
            },
            destination: {
              type: 'Point' as const,
              coordinates: [
                ride.destination.coordinates[0],
                ride.destination.coordinates[1],
              ] as [number, number],
            },
            ...(ride.originAddress ? { originAddress: ride.originAddress } : {}),
            ...(ride.destinationAddress ? { destinationAddress: ride.destinationAddress } : {}),
            departureAt: ride.departureAt.toISOString(),
            status: ride.status,
            farePerSeat: ride.farePerSeat,
            seatsTotal: ride.seatsTotal,
            seatsAvailable: ride.seatsAvailable,
          },
        }
      : {}),
    ...(booking.confirmedAt ? { confirmedAt: booking.confirmedAt.toISOString() } : {}),
    ...(booking.cancelledAt ? { cancelledAt: booking.cancelledAt.toISOString() } : {}),
    ...(booking.cancellationReason ? { cancellationReason: booking.cancellationReason } : {}),
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}

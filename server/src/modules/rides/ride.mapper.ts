import type { RideRecord } from './ride.model.js';
import type { RideResponse } from './ride.schemas.js';

/**
 * Explicit DTO boundary. Repositories hand back lean Mongo records; controllers
 * only ever see this shape, so `_id`, `__v` or future internal fields can never
 * leak into the public contract.
 */
export function toRideResponse(
  ride: RideRecord,
  options: { distanceMeters?: number } = {},
): RideResponse {
  return {
    id: String(ride._id),
    driverId: String(ride.driverId),
    origin: {
      type: 'Point',
      coordinates: [ride.origin.coordinates[0], ride.origin.coordinates[1]],
    },
    destination: {
      type: 'Point',
      coordinates: [ride.destination.coordinates[0], ride.destination.coordinates[1]],
    },
    ...(ride.originAddress ? { originAddress: ride.originAddress } : {}),
    ...(ride.destinationAddress ? { destinationAddress: ride.destinationAddress } : {}),
    departureAt: ride.departureAt.toISOString(),
    seatsTotal: ride.seatsTotal,
    seatsAvailable: ride.seatsAvailable,
    farePerSeat: ride.farePerSeat,
    ...(ride.vehicle
      ? {
          vehicle: {
            make: ride.vehicle.make,
            model: ride.vehicle.model,
            plate: ride.vehicle.plate,
            ac: ride.vehicle.ac ?? false,
          },
        }
      : {}),
    preferences: {
      genderPreference: ride.preferences?.genderPreference ?? 'any',
      maxDetourMeters: ride.preferences?.maxDetourMeters ?? 3_000,
    },
    status: ride.status,
    ...(options.distanceMeters !== undefined
      ? { distanceMeters: Math.round(options.distanceMeters) }
      : {}),
    ...(ride.cancelledAt ? { cancelledAt: ride.cancelledAt.toISOString() } : {}),
    ...(ride.cancellationReason ? { cancellationReason: ride.cancellationReason } : {}),
    createdAt: ride.createdAt.toISOString(),
    updatedAt: ride.updatedAt.toISOString(),
  };
}

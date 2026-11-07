import type { RideRequestRecord } from './rideRequest.model.js';
import type { RideRequestResponse } from './rideRequest.schemas.js';

/**
 * Explicit DTO boundary: `_id`, `__v` and future internal fields never leak
 * into the public contract.
 */
export function toRideRequestResponse(
  request: RideRequestRecord,
  options: { distanceMeters?: number } = {},
): RideRequestResponse {
  return {
    id: String(request._id),
    riderId: String(request.riderId),
    origin: {
      type: 'Point',
      coordinates: [request.origin.coordinates[0], request.origin.coordinates[1]],
    },
    destination: {
      type: 'Point',
      coordinates: [request.destination.coordinates[0], request.destination.coordinates[1]],
    },
    ...(request.originAddress ? { originAddress: request.originAddress } : {}),
    ...(request.destinationAddress ? { destinationAddress: request.destinationAddress } : {}),
    departureAt: request.departureAt.toISOString(),
    flexMinutes: request.flexMinutes,
    seats: request.seats,
    ...(request.maxFarePerSeat !== undefined && request.maxFarePerSeat !== null
      ? { maxFarePerSeat: request.maxFarePerSeat }
      : {}),
    ...(request.notes ? { notes: request.notes } : {}),
    status: request.status,
    ...(request.matchedRideId ? { matchedRideId: String(request.matchedRideId) } : {}),
    ...(options.distanceMeters !== undefined
      ? { distanceMeters: Math.round(options.distanceMeters) }
      : {}),
    ...(request.cancelledAt ? { cancelledAt: request.cancelledAt.toISOString() } : {}),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

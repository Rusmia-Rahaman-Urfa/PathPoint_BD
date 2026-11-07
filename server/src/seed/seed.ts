import { trusted, type Types } from 'mongoose';
import { hashPassword } from '../lib/password.js';
import { RideModel } from '../modules/rides/ride.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { SEED_PASSWORD, SEED_RIDES, SEED_USERS } from './data.js';

export interface SeedSummary {
  users: number;
  rides: number;
  removedUsers: number;
  removedRides: number;
}

/**
 * Idempotent seed: re-running replaces the demo dataset instead of duplicating
 * it. Only accounts ending in `@pathpoint.test` are ever touched, so a real
 * developer database is never wiped by accident.
 */
export async function seedDatabase(): Promise<SeedSummary> {
  const seedEmails = SEED_USERS.map((user) => user.email);

  // `trusted` bypasses the global `sanitizeFilter`, which would otherwise wrap
  // these operator objects in `$eq` and break the `$in` lookups.
  const existingUsers = await UserModel.find({ email: trusted({ $in: seedEmails }) })
    .select('_id')
    .lean();

  const existingIds = existingUsers.map((user) => user._id);
  const removedRides =
    existingIds.length > 0
      ? (await RideModel.deleteMany({ driverId: trusted({ $in: existingIds }) })).deletedCount
      : 0;
  const removedUsers =
    existingIds.length > 0
      ? (await UserModel.deleteMany({ _id: trusted({ $in: existingIds }) })).deletedCount
      : 0;

  // One hash is reused across demo accounts to keep seeding fast; production
  // registration always hashes per user.
  const passwordHash = await hashPassword(SEED_PASSWORD);

  const insertedUsers = await UserModel.insertMany(
    SEED_USERS.map((user) => ({
      name: user.name,
      email: user.email,
      phone: user.phone,
      passwordHash,
      role: user.role,
      homeLocation: { type: 'Point', coordinates: [user.home.lng, user.home.lat] },
    })),
  );

  const userIdByKey = new Map<string, Types.ObjectId>();
  insertedUsers.forEach((user, index) => {
    const seedUser = SEED_USERS[index];
    if (seedUser) userIdByKey.set(seedUser.key, user._id);
  });

  const baseDate = new Date();

  const insertedRides = await RideModel.insertMany(
    SEED_RIDES.map((ride) => {
      const driverId = userIdByKey.get(ride.driverKey);
      if (!driverId) {
        throw new Error(`Seed ride references unknown driver key: ${ride.driverKey}`);
      }

      return {
        driverId,
        origin: { type: 'Point', coordinates: [ride.origin.lng, ride.origin.lat] },
        destination: { type: 'Point', coordinates: [ride.destination.lng, ride.destination.lat] },
        originAddress: ride.origin.address,
        destinationAddress: ride.destination.address,
        departureAt: departureFor(baseDate, ride.dayOffset, ride.hour, ride.minute),
        seatsTotal: ride.seatsTotal,
        seatsAvailable: ride.seatsTotal,
        farePerSeat: ride.farePerSeat,
        vehicle: ride.vehicle,
        preferences: {
          genderPreference: ride.genderPreference ?? 'any',
          maxDetourMeters: ride.maxDetourMeters ?? 3_000,
        },
        status: 'published',
      };
    }),
  );

  // Indexes are what make `$geoNear` work; guarantee them before returning.
  await Promise.all([UserModel.createIndexes(), RideModel.createIndexes()]);

  return {
    users: insertedUsers.length,
    rides: insertedRides.length,
    removedUsers,
    removedRides,
  };
}

function departureFor(base: Date, dayOffset: number, hour: number, minute: number): Date {
  const date = new Date(base);
  date.setDate(date.getDate() + 1 + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

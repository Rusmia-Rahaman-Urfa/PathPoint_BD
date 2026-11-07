import { describe, expect, it } from 'vitest';
import { RideModel } from '../src/modules/rides/ride.model.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { CHATTOGRAM_PLACES, DHAKA_PLACES, SEED_RIDES, SEED_USERS } from '../src/seed/data.js';
import { seedDatabase } from '../src/seed/seed.js';

describe('seed script', () => {
  it('creates the full demo dataset', async () => {
    const summary = await seedDatabase();

    expect(summary.users).toBe(SEED_USERS.length);
    expect(summary.rides).toBe(SEED_RIDES.length);

    const users = await UserModel.find().lean();
    const rides = await RideModel.find().lean();

    expect(users).toHaveLength(SEED_USERS.length);
    expect(rides).toHaveLength(SEED_RIDES.length);

    for (const ride of rides) {
      expect(ride.origin.type).toBe('Point');
      expect(ride.destination.type).toBe('Point');
      expect(ride.origin.coordinates).toHaveLength(2);
      expect(ride.status).toBe('published');
      expect(ride.seatsAvailable).toBe(ride.seatsTotal);
      expect(ride.departureAt.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it('covers both Dhaka and Chattogram', async () => {
    await seedDatabase();

    const rides = await RideModel.find().lean();
    const lngs = rides.map((ride) => ride.origin.coordinates[0]);

    // Dhaka sits around 90.3-90.5, Chattogram around 91.7-91.9.
    expect(lngs.some((lng) => lng < 91)).toBe(true);
    expect(lngs.some((lng) => lng > 91)).toBe(true);
  });

  it('is idempotent - re-running replaces rather than duplicates', async () => {
    await seedDatabase();
    const second = await seedDatabase();

    expect(second.removedUsers).toBe(SEED_USERS.length);
    expect(second.removedRides).toBe(SEED_RIDES.length);
    expect(await UserModel.countDocuments()).toBe(SEED_USERS.length);
    expect(await RideModel.countDocuments()).toBe(SEED_RIDES.length);
  });

  it('produces data the 2dsphere index can match', async () => {
    await seedDatabase();

    const banani = DHAKA_PLACES.banani;
    const results = await RideModel.aggregate<{ distanceMeters: number; originAddress: string }>([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [banani.lng, banani.lat] },
          distanceField: 'distanceMeters',
          maxDistance: 15_000,
          spherical: true,
          key: 'origin',
        },
      },
      { $limit: 5 },
    ]);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.distanceMeters).toBeLessThanOrEqual(
      results[results.length - 1]!.distanceMeters,
    );
    expect(results.every((ride) => ride.distanceMeters <= 15_000)).toBe(true);

    const chattogram = CHATTOGRAM_PLACES.gecCircle;
    const ctgResults = await RideModel.aggregate<{ distanceMeters: number }>([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [chattogram.lng, chattogram.lat] },
          distanceField: 'distanceMeters',
          maxDistance: 10_000,
          spherical: true,
          key: 'origin',
        },
      },
      { $limit: 5 },
    ]);

    expect(ctgResults.length).toBeGreaterThan(0);
  });

  it('creates a 2dsphere index on origin and destination', async () => {
    await RideModel.createIndexes();
    const indexes = await RideModel.collection.indexes();

    const geoIndexes = indexes.filter(
      (index) => Object.values(index.key).includes('2dsphere'),
    );

    expect(geoIndexes.length).toBeGreaterThanOrEqual(2);
    expect(geoIndexes.some((index) => 'origin' in index.key)).toBe(true);
    expect(geoIndexes.some((index) => 'destination' in index.key)).toBe(true);
  });
});

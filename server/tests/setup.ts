/**
 * Test bootstrap.
 *
 * Runs before any test module is imported, so `config/env.ts` sees the test
 * values below. A real MongoDB instance (in-memory) is used because the
 * 2dsphere behaviour we care about cannot be faithfully mocked.
 */

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/pathpoint_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-characters-long';
process.env.JWT_EXPIRES_IN = '15m';
// Low cost factor keeps the auth suite fast; production uses 12.
process.env.BCRYPT_ROUNDS = '8';
process.env.RATE_LIMIT_MAX = '100000';
process.env.AUTH_RATE_LIMIT_MAX = '100000';

import { afterAll, afterEach, beforeAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { UserModel } from '../src/modules/users/user.model.js';
import { RideModel } from '../src/modules/rides/ride.model.js';
import { RideRequestModel } from '../src/modules/requests/rideRequest.model.js';
import { BookingModel } from '../src/modules/bookings/booking.model.js';

let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  // Mirror the production connection settings so tests catch bugs such as
  // operator objects being mangled by sanitizeFilter.
  mongoose.set('strictQuery', true);
  mongoose.set('sanitizeFilter', true);

  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'pathpoint_test' });

  // Geo queries fail without the 2dsphere indexes; build them deterministically
  // instead of relying on background autoIndex timing.
  await Promise.all([
    UserModel.createIndexes(),
    RideModel.createIndexes(),
    RideRequestModel.createIndexes(),
    BookingModel.createIndexes(),
  ]);
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

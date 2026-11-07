import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  bearingDeltaDegrees,
  haversineMeters,
  initialBearingDegrees,
  toGeoPoint,
} from '../src/lib/geo.js';
import {
  MAX_BEARING_DELTA_DEGREES,
  SCORE_WEIGHTS,
  scoreCandidate,
} from '../src/modules/matching/matching.scoring.js';
import { API, createSession, ridePayload, withBearer } from './helpers/factory.js';

const app = createApp();

const auth = (token: string) => ({ authorization: withBearer(token) });

const postRide = (token: string, overrides: Record<string, unknown> = {}) =>
  request(app).post(`${API}/rides`).set(auth(token)).send(ridePayload(overrides));

const search = (token: string, body: Record<string, unknown>) =>
  request(app).post(`${API}/matches/search`).set(auth(token)).send(body);

const isoInHours = (hours: number): string =>
  new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

const BANANI = { type: 'Point', coordinates: [90.4043, 23.7937] } as const;
const DHANMONDI = { type: 'Point', coordinates: [90.3742, 23.7461] } as const;
const NORTH_400M = { type: 'Point', coordinates: [90.4043, 23.7973] } as const;
const SOUTH_400M = { type: 'Point', coordinates: [90.4043, 23.7897] } as const;
/** ~1.4 km south-west of Banani, on the same Banani -> Dhanmondi corridor. */
const FAR_ALONG_CORRIDOR = { type: 'Point', coordinates: [90.3973, 23.7826] } as const;

const searchPayload = (overrides: Record<string, unknown> = {}) => ({
  origin: BANANI,
  destination: DHANMONDI,
  departureAt: isoInHours(2),
  flexMinutes: 30,
  seats: 1,
  pickupRadiusMeters: 2000,
  dropoffRadiusMeters: 1500,
  limit: 20,
  ...overrides,
});

describe('POST /matches/search', () => {
  it('requires authentication', async () => {
    const res = await request(app).post(`${API}/matches/search`).send(searchPayload());

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects unknown keys and impossible searches', async () => {
    const rider = await createSession(app);

    const unknownKey = await search(rider.token, searchPayload({ maxBearingDeltaDegrees: 60 }));
    expect(unknownKey.status).toBe(422);
    expect(
      unknownKey.body.error.details.some(
        (detail: { path: string }) => detail.path === 'maxBearingDeltaDegrees',
      ),
    ).toBe(true);

    const identical = await search(
      rider.token,
      searchPayload({ destination: BANANI }),
    );
    expect(identical.status).toBe(422);
    expect(identical.body.error.details[0].path).toBe('destination');

    const past = await search(
      rider.token,
      searchPayload({ departureAt: isoInHours(-3), flexMinutes: 30 }),
    );
    expect(past.status).toBe(422);
    expect(past.body.error.details[0].path).toBe('departureAt');

    const noSeats = await search(rider.token, searchPayload({ seats: 0 }));
    expect(noSeats.status).toBe(422);
  });

  it('ranks a near pickup above a farther one on the same corridor', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const departureAt = isoInHours(2);

    const near = await postRide(driver.token, {
      origin: BANANI,
      destination: DHANMONDI,
      departureAt,
      seatsTotal: 3,
    });
    const far = await postRide(driver.token, {
      origin: FAR_ALONG_CORRIDOR,
      destination: DHANMONDI,
      departureAt,
      seatsTotal: 3,
    });

    expect(near.status).toBe(201);
    expect(far.status).toBe(201);

    const res = await search(
      rider.token,
      searchPayload({
        departureAt,
        pickupRadiusMeters: 3000,
        dropoffRadiusMeters: 1000,
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.matches).toHaveLength(2);
    expect(res.body.meta.candidates).toBe(2);
    expect(res.body.meta.returned).toBe(2);

    const [first, second] = res.body.data.matches;
    expect(first.ride.id).toBe(near.body.data.id);
    expect(second.ride.id).toBe(far.body.data.id);
    expect(first.score).toBeGreaterThan(second.score);
    expect(first.breakdown.pickup.points).toBeGreaterThan(second.breakdown.pickup.points);
    expect(first.breakdown.pickup.distanceMeters).toBeLessThan(
      second.breakdown.pickup.distanceMeters,
    );
    // The ride card carries the pickup distance as well.
    expect(first.ride.distanceMeters).toBeLessThan(second.ride.distanceMeters);
  });

  it('rejects rides heading more than 60 degrees away from the commuter', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const departureAt = isoInHours(2);

    const aligned = await postRide(driver.token, {
      origin: BANANI,
      destination: NORTH_400M,
      departureAt,
      seatsTotal: 3,
    });
    const opposite = await postRide(driver.token, {
      origin: BANANI,
      destination: SOUTH_400M,
      departureAt,
      seatsTotal: 3,
    });

    expect(aligned.status).toBe(201);
    expect(opposite.status).toBe(201);

    const res = await search(
      rider.token,
      searchPayload({
        origin: BANANI,
        destination: NORTH_400M,
        departureAt,
        pickupRadiusMeters: 2500,
        dropoffRadiusMeters: 2500,
      }),
    );

    expect(res.status).toBe(200);
    // Both rides pass the geo hard filters; only the bearing filter separates them.
    expect(res.body.meta.candidates).toBe(2);
    expect(res.body.meta.rejectedBearing).toBe(1);
    expect(res.body.meta.returned).toBe(1);
    expect(res.body.data.matches).toHaveLength(1);
    expect(res.body.data.matches[0].ride.id).toBe(aligned.body.data.id);
    expect(res.body.data.matches[0].breakdown.bearing.deltaDegrees).toBeLessThan(1);
    expect(res.body.data.matches[0].breakdown.bearing.max).toBe(SCORE_WEIGHTS.bearing);
    expect(res.body.data.matches[0].breakdown.bearing.maxDeltaDegrees).toBe(
      MAX_BEARING_DELTA_DEGREES,
    );
  });

  it('lets a better time fit outrank a slightly closer pickup', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const preferred = isoInHours(2);

    // Closest possible pickup, but departure sits on the edge of the window.
    const closeButLate = await postRide(driver.token, {
      origin: BANANI,
      destination: DHANMONDI,
      departureAt: new Date(Date.parse(preferred) - 30 * 60_000).toISOString(),
      seatsTotal: 3,
    });
    // ~750 m walk to the pickup, but exactly at the preferred departure time.
    const slightlyFarOnTime = await postRide(driver.token, {
      origin: { type: 'Point', coordinates: [90.41, 23.798] },
      destination: DHANMONDI,
      departureAt: preferred,
      seatsTotal: 3,
    });

    expect(closeButLate.status).toBe(201);
    expect(slightlyFarOnTime.status).toBe(201);

    const res = await search(
      rider.token,
      searchPayload({
        departureAt: preferred,
        flexMinutes: 30,
        pickupRadiusMeters: 3000,
        dropoffRadiusMeters: 1500,
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.matches).toHaveLength(2);

    const [first, second] = res.body.data.matches;
    expect(first.ride.id).toBe(slightlyFarOnTime.body.data.id);
    expect(first.breakdown.time.points).toBeGreaterThan(second.breakdown.time.points);
    expect(second.breakdown.time.points).toBe(0);
  });

  it('excludes the requester’s own rides', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const departureAt = isoInHours(2);

    await postRide(driver.token, { origin: BANANI, destination: DHANMONDI, departureAt });

    const res = await search(
      driver.token,
      searchPayload({ departureAt, pickupRadiusMeters: 3000 }),
    );

    expect(res.status).toBe(200);
    expect(res.body.meta.candidates).toBe(0);
    expect(res.body.data.matches).toHaveLength(0);
  });

  it('filters rides without enough free seats', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const departureAt = isoInHours(2);

    await postRide(driver.token, {
      origin: BANANI,
      destination: DHANMONDI,
      departureAt,
      seatsTotal: 2,
    });

    const res = await search(
      rider.token,
      searchPayload({ departureAt, seats: 3, pickupRadiusMeters: 3000 }),
    );

    expect(res.status).toBe(200);
    expect(res.body.meta.candidates).toBe(0);
    expect(res.body.data.matches).toHaveLength(0);
  });

  it('filters cancelled rides', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const departureAt = isoInHours(2);

    const ride = await postRide(driver.token, {
      origin: BANANI,
      destination: DHANMONDI,
      departureAt,
    });
    await request(app)
      .delete(`${API}/rides/${ride.body.data.id}`)
      .set(auth(driver.token))
      .expect(204);

    const res = await search(
      rider.token,
      searchPayload({ departureAt, pickupRadiusMeters: 3000 }),
    );

    expect(res.status).toBe(200);
    expect(res.body.meta.candidates).toBe(0);
    expect(res.body.data.matches).toHaveLength(0);
  });

  it('filters rides outside the departure window', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const departureAt = isoInHours(2);

    await postRide(driver.token, {
      origin: BANANI,
      destination: DHANMONDI,
      departureAt: isoInHours(5),
    });

    const res = await search(
      rider.token,
      searchPayload({ departureAt, flexMinutes: 30, pickupRadiusMeters: 3000 }),
    );

    expect(res.status).toBe(200);
    expect(res.body.meta.candidates).toBe(0);
    expect(res.body.data.matches).toHaveLength(0);
  });

  it('filters rides whose dropoff is outside the tolerance', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const departureAt = isoInHours(2);

    // Same pickup area, but the ride ends in Uttara instead of Dhanmondi.
    await postRide(driver.token, {
      origin: BANANI,
      destination: { type: 'Point', coordinates: [90.3654, 23.8759] },
      departureAt,
    });

    const res = await search(
      rider.token,
      searchPayload({
        departureAt,
        pickupRadiusMeters: 3000,
        dropoffRadiusMeters: 1500,
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.meta.candidates).toBe(0);
    expect(res.body.data.matches).toHaveLength(0);
  });

  it('returns an auditable 0-100 breakdown that sums correctly', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const departureAt = isoInHours(2);

    await postRide(driver.token, {
      origin: BANANI,
      destination: DHANMONDI,
      departureAt,
      seatsTotal: 3,
    });

    const res = await search(
      rider.token,
      searchPayload({ departureAt, pickupRadiusMeters: 3000 }),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.matches).toHaveLength(1);

    const [card] = res.body.data.matches;
    const parts = Object.values(card.breakdown) as Array<{ points: number; max: number }>;

    expect(parts.reduce((sum, part) => sum + part.max, 0)).toBe(100);
    expect(parts.reduce((sum, part) => sum + part.points, 0)).toBeCloseTo(card.score, 1);
    expect(card.score).toBeGreaterThanOrEqual(0);
    expect(card.score).toBeLessThanOrEqual(100);
    expect(card.breakdown.availability.max).toBe(SCORE_WEIGHTS.availability);

    // Exact pickup, exact dropoff, exact time, exact bearing, all seats free.
    expect(card.score).toBe(100);
  });

  it('echoes the resolved search window', async () => {
    const rider = await createSession(app);
    const departureAt = isoInHours(2);

    const res = await search(rider.token, searchPayload({ departureAt, flexMinutes: 45 }));

    expect(res.status).toBe(200);
    expect(res.body.data.query.departureAt).toBe(new Date(departureAt).toISOString());
    expect(res.body.data.query.windowStart).toBe(
      new Date(Date.parse(departureAt) - 45 * 60_000).toISOString(),
    );
    expect(res.body.data.query.windowEnd).toBe(
      new Date(Date.parse(departureAt) + 45 * 60_000).toISOString(),
    );
  });
});

describe('scoreCandidate', () => {
  const baseInput = {
    pickupDistanceMeters: 0,
    dropoffDistanceMeters: 0,
    pickupRadiusMeters: 2000,
    dropoffRadiusMeters: 2000,
    departureAt: new Date('2026-11-07T08:00:00.000Z'),
    preferredDepartureAt: new Date('2026-11-07T08:00:00.000Z'),
    flexMinutes: 30,
    rideBearing: 237,
    requestBearing: 237,
    seatsAvailable: 3,
    seatsTotal: 3,
    seatsRequested: 1,
  };

  it('awards every point for an exact route, time and bearing', () => {
    const result = scoreCandidate(baseInput);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(100);
    expect(result?.breakdown.pickup.points).toBe(SCORE_WEIGHTS.pickup);
    expect(result?.breakdown.dropoff.points).toBe(SCORE_WEIGHTS.dropoff);
    expect(result?.breakdown.time.points).toBe(SCORE_WEIGHTS.time);
    expect(result?.breakdown.bearing.points).toBe(SCORE_WEIGHTS.bearing);
    expect(result?.breakdown.availability.points).toBe(SCORE_WEIGHTS.availability);
  });

  it('rejects candidates whose bearing delta exceeds 60 degrees', () => {
    expect(scoreCandidate({ ...baseInput, rideBearing: 297 })).not.toBeNull();
    expect(scoreCandidate({ ...baseInput, rideBearing: 298 })).toBeNull();
    expect(scoreCandidate({ ...baseInput, rideBearing: 57 })).toBeNull(); // 180 degrees away
  });

  it('is monotonic in pickup distance', () => {
    const near = scoreCandidate({ ...baseInput, pickupDistanceMeters: 100 });
    const far = scoreCandidate({ ...baseInput, pickupDistanceMeters: 900 });

    expect(near?.score).toBeGreaterThan(far!.score);
    expect(near?.breakdown.pickup.points).toBeGreaterThan(far!.breakdown.pickup.points);
  });

  it('decays the time score linearly to zero at the window edge', () => {
    const onTime = scoreCandidate(baseInput);
    const halfWindow = scoreCandidate({
      ...baseInput,
      departureAt: new Date('2026-11-07T08:15:00.000Z'),
    });
    const edge = scoreCandidate({
      ...baseInput,
      departureAt: new Date('2026-11-07T08:30:00.000Z'),
    });

    expect(onTime?.breakdown.time.points).toBe(20);
    expect(halfWindow?.breakdown.time.points).toBe(10);
    expect(edge?.breakdown.time.points).toBe(0);
  });
});

describe('geo helpers', () => {
  it('computes bearing deltas across the 0/360 boundary', () => {
    expect(bearingDeltaDegrees(350, 10)).toBe(20);
    expect(bearingDeltaDegrees(10, 350)).toBe(20);
    expect(bearingDeltaDegrees(0, 180)).toBe(180);
    expect(bearingDeltaDegrees(45, 45)).toBe(0);
  });

  it('computes a northward bearing and symmetric distance', () => {
    const banani = toGeoPoint(90.4043, 23.7937);
    const north = toGeoPoint(90.4043, 23.7973);

    expect(initialBearingDegrees(banani, north)).toBeCloseTo(0, 3);
    expect(haversineMeters(banani, north)).toBeCloseTo(
      haversineMeters(north, banani),
      6,
    );
    expect(haversineMeters(banani, north)).toBeGreaterThan(390);
    expect(haversineMeters(banani, north)).toBeLessThan(410);
  });
});

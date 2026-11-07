import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { RideRequestModel } from '../src/modules/requests/rideRequest.model.js';
import { API, createSession, ridePayload, withBearer } from './helpers/factory.js';

const app = createApp();

const auth = (token: string) => ({ authorization: withBearer(token) });

const BANANI: [number, number] = [90.4043, 23.7937];
const DHANMONDI: [number, number] = [90.3742, 23.7461];
const GULSHAN: [number, number] = [90.4156, 23.7806];

const departureAt = (offsetMs = 3 * 60 * 60 * 1000): string =>
  new Date(Date.now() + offsetMs).toISOString();

const requestPayload = (overrides: Record<string, unknown> = {}) => ({
  origin: { type: 'Point', coordinates: BANANI },
  destination: { type: 'Point', coordinates: DHANMONDI },
  originAddress: 'Banani, Dhaka',
  destinationAddress: 'Dhanmondi 27, Dhaka',
  departureAt: departureAt(),
  flexMinutes: 30,
  seats: 1,
  ...overrides,
});

const postRequest = (token: string, overrides: Record<string, unknown> = {}) =>
  request(app)
    .post(`${API}/matches/requests`)
    .set(auth(token))
    .send(requestPayload(overrides));

const postRide = (token: string, overrides: Record<string, unknown> = {}) =>
  request(app).post(`${API}/rides`).set(auth(token)).send(ridePayload(overrides));

describe('POST /matches/requests', () => {
  it('requires authentication', async () => {
    const res = await request(app).post(`${API}/matches/requests`).send(requestPayload());

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('publishes rider intent owned by the caller with sensible defaults', async () => {
    const rider = await createSession(app);

    const res = await postRequest(rider.token, { flexMinutes: undefined, seats: undefined });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/matches/requests/${res.body.data.id}`);
    expect(res.body.data.riderId).toBe(rider.userId);
    expect(res.body.data.status).toBe('open');
    expect(res.body.data.flexMinutes).toBe(30);
    expect(res.body.data.seats).toBe(1);
    expect(res.body.data.origin.coordinates).toEqual(BANANI);
    expect(res.body.data.destination.coordinates).toEqual(DHANMONDI);
  });

  it('rejects a departure in the past', async () => {
    const rider = await createSession(app);

    const res = await postRequest(rider.token, {
      departureAt: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('departureAt');
  });

  it('rejects an origin identical to the destination', async () => {
    const rider = await createSession(app);

    const res = await postRequest(rider.token, {
      destination: { type: 'Point', coordinates: BANANI },
    });

    expect(res.status).toBe(422);
    expect(res.body.error.details.some((d: { path: string }) => d.path === 'destination')).toBe(
      true,
    );
  });

  it('rejects unknown keys and out-of-range windows', async () => {
    const rider = await createSession(app);

    const unknown = await postRequest(rider.token, { riderId: 'x' });
    expect(unknown.status).toBe(422);

    const flex = await postRequest(rider.token, { flexMinutes: 500 });
    expect(flex.status).toBe(422);
    expect(flex.body.error.details[0].path).toBe('flexMinutes');
  });
});

describe('GET /matches/requests', () => {
  it('paginates and filters by status', async () => {
    const rider = await createSession(app);
    for (let index = 0; index < 3; index += 1) {
      const created = await postRequest(rider.token, { notes: `trip-${index}` });
      expect(created.status).toBe(201);
    }
    const cancelled = await postRequest(rider.token, { notes: 'cancelled-trip' });
    await request(app)
      .delete(`${API}/matches/requests/${cancelled.body.data.id}`)
      .set(auth(rider.token));

    const page = await request(app)
      .get(`${API}/matches/requests?page=1&limit=2`)
      .set(auth(rider.token));

    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toMatchObject({ page: 1, limit: 2, total: 4, totalPages: 2 });

    const open = await request(app)
      .get(`${API}/matches/requests?status=open`)
      .set(auth(rider.token));
    expect(open.body.data).toHaveLength(3);

    const cancelledList = await request(app)
      .get(`${API}/matches/requests?status=cancelled`)
      .set(auth(rider.token));
    expect(cancelledList.body.data).toHaveLength(1);
  });

  it('orders by distance when near is supplied', async () => {
    const rider = await createSession(app);
    await postRequest(rider.token, { origin: { type: 'Point', coordinates: [90.3948, 23.8687] } });
    await postRequest(rider.token, { origin: { type: 'Point', coordinates: BANANI } });

    const res = await request(app)
      .get(`${API}/matches/requests?near=90.4043,23.7937&radiusMeters=15000`)
      .set(auth(rider.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].distanceMeters).toBeLessThan(res.body.data[1].distanceMeters);
  });

  it('requires authentication and rejects unknown query parameters', async () => {
    expect((await request(app).get(`${API}/matches/requests`)).status).toBe(401);

    const rider = await createSession(app);
    const res = await request(app)
      .get(`${API}/matches/requests?seats=99`)
      .set(auth(rider.token));
    expect(res.status).toBe(422);
  });
});

describe('GET /matches/requests/mine', () => {
  it('returns only the caller requests', async () => {
    const owner = await createSession(app);
    const other = await createSession(app);

    await postRequest(owner.token);
    await postRequest(other.token);

    const res = await request(app)
      .get(`${API}/matches/requests/mine`)
      .set(auth(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].riderId).toBe(owner.userId);
  });
});

describe('GET /matches/requests/:id', () => {
  it('returns the request to its owner', async () => {
    const rider = await createSession(app);
    const created = await postRequest(rider.token);

    const res = await request(app)
      .get(`${API}/matches/requests/${created.body.data.id}`)
      .set(auth(rider.token));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(created.body.data.id);
  });

  it('forbids another rider', async () => {
    const owner = await createSession(app);
    const intruder = await createSession(app);
    const created = await postRequest(owner.token);

    const res = await request(app)
      .get(`${API}/matches/requests/${created.body.data.id}`)
      .set(auth(intruder.token));

    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown and 422 for malformed ids', async () => {
    const rider = await createSession(app);

    const unknown = await request(app)
      .get(`${API}/matches/requests/64b7f1c2a1b2c3d4e5f60718`)
      .set(auth(rider.token));
    expect(unknown.status).toBe(404);

    const malformed = await request(app)
      .get(`${API}/matches/requests/not-an-id`)
      .set(auth(rider.token));
    expect(malformed.status).toBe(422);
  });
});

describe('DELETE /matches/requests/:id', () => {
  it('soft-cancels an open request and is idempotent', async () => {
    const rider = await createSession(app);
    const created = await postRequest(rider.token);

    const first = await request(app)
      .delete(`${API}/matches/requests/${created.body.data.id}`)
      .set(auth(rider.token));
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('cancelled');
    expect(first.body.data.cancelledAt).toBeTypeOf('string');

    const second = await request(app)
      .delete(`${API}/matches/requests/${created.body.data.id}`)
      .set(auth(rider.token));
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('cancelled');

    // Soft delete: the document is retained for audit.
    expect(await RideRequestModel.countDocuments()).toBe(1);
  });

  it('forbids another rider', async () => {
    const owner = await createSession(app);
    const intruder = await createSession(app);
    const created = await postRequest(owner.token);

    const res = await request(app)
      .delete(`${API}/matches/requests/${created.body.data.id}`)
      .set(auth(intruder.token));

    expect(res.status).toBe(403);
  });

  it('refuses to cancel a matched request', async () => {
    const rider = await createSession(app);
    const created = await postRequest(rider.token);

    await RideRequestModel.updateOne(
      { _id: created.body.data.id },
      { $set: { status: 'matched' } },
    );

    const res = await request(app)
      .delete(`${API}/matches/requests/${created.body.data.id}`)
      .set(auth(rider.token));

    expect(res.status).toBe(409);
  });
});

describe('GET /matches/requests/reverse', () => {
  const reverse = (token: string, rideId: string) =>
    request(app)
      .get(
        `${API}/matches/requests/reverse?rideId=${rideId}&pickupRadiusMeters=2000&dropoffRadiusMeters=2000`,
      )
      .set(auth(token));

  it('returns riders whose intent fits the ride and excludes non-matches', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const departure = departureAt();
    const ride = await postRide(driver.token, {
      departureAt: departure,
      seatsTotal: 2,
      farePerSeat: 80,
    });
    const rideId = ride.body.data.id as string;

    // Fits: same corridor, inside flex, enough seats, can afford it.
    const good = await createSession(app);
    const goodRequest = await postRequest(good.token, { departureAt: departure, seats: 2 });
    expect(goodRequest.status).toBe(201);

    // Same corridor but three hours away: each request's flexMinutes is used.
    const late = await createSession(app);
    await postRequest(late.token, {
      departureAt: departureAt(6 * 60 * 60 * 1000),
      flexMinutes: 10,
    });

    // Same pickup but a different dropoff corridor.
    const wrongWay = await createSession(app);
    await postRequest(wrongWay.token, {
      destination: { type: 'Point', coordinates: GULSHAN },
    });

    // More seats than the ride has free.
    const tooMany = await createSession(app);
    await postRequest(tooMany.token, { seats: 3 });

    // Budget below the fare.
    const cheap = await createSession(app);
    await postRequest(cheap.token, { maxFarePerSeat: 20 });

    // The driver's own request must never match their own ride.
    await postRequest(driver.token);

    const res = await reverse(driver.token, rideId);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(goodRequest.body.data.id);
    expect(res.body.data[0].distanceMeters).toBeLessThan(100);
    expect(res.body.meta).toMatchObject({ rideId, candidates: 1, returned: 1 });
  });

  it('includes requests whose budget exactly covers the fare', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const departure = departureAt();
    const ride = await postRide(driver.token, { departureAt: departure, farePerSeat: 80 });

    const rider = await createSession(app);
    const created = await postRequest(rider.token, {
      departureAt: departure,
      maxFarePerSeat: 80,
    });

    const res = await reverse(driver.token, ride.body.data.id);

    expect(res.status).toBe(200);
    expect(res.body.data.map((item: { id: string }) => item.id)).toContain(created.body.data.id);
  });

  it('forbids a driver from probing another driver ride', async () => {
    const owner = await createSession(app, { role: 'driver' });
    const intruder = await createSession(app, { role: 'driver' });
    const ride = await postRide(owner.token);

    const res = await reverse(intruder.token, ride.body.data.id);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects cancelled rides, unknown rides and malformed ride ids', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const ride = await postRide(driver.token);
    await request(app).delete(`${API}/rides/${ride.body.data.id}`).set(auth(driver.token));

    const cancelled = await reverse(driver.token, ride.body.data.id);
    expect(cancelled.status).toBe(409);

    const unknown = await reverse(driver.token, '64b7f1c2a1b2c3d4e5f60718');
    expect(unknown.status).toBe(404);

    const malformed = await reverse(driver.token, 'not-an-id');
    expect(malformed.status).toBe(422);
  });
});

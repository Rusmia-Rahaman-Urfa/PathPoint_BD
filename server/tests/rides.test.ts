import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { RideModel } from '../src/modules/rides/ride.model.js';
import { API, createSession, ridePayload, withBearer } from './helpers/factory.js';

const app = createApp();

const auth = (token: string) => ({ authorization: withBearer(token) });

const postRide = (token: string, overrides: Record<string, unknown> = {}) =>
  request(app).post(`${API}/rides`).set(auth(token)).send(ridePayload(overrides));

describe('POST /rides', () => {
  it('requires authentication', async () => {
    const res = await request(app).post(`${API}/rides`).send(ridePayload());

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('publishes a ride owned by the caller', async () => {
    const driver = await createSession(app, { role: 'driver' });

    const res = await postRide(driver.token);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/rides/${res.body.data.id}`);
    expect(res.body.data.driverId).toBe(driver.userId);
    expect(res.body.data.seatsTotal).toBe(3);
    expect(res.body.data.seatsAvailable).toBe(3);
    expect(res.body.data.status).toBe('published');
    expect(res.body.data.origin.coordinates).toEqual([90.4043, 23.7937]);
    expect(res.body.data.preferences).toEqual({ genderPreference: 'any', maxDetourMeters: 3000 });
  });

  it('rejects a departure in the past', async () => {
    const driver = await createSession(app, { role: 'driver' });

    const res = await postRide(driver.token, {
      departureAt: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('departureAt');
  });

  it('rejects coordinates outside Bangladesh', async () => {
    const driver = await createSession(app, { role: 'driver' });

    const res = await postRide(driver.token, {
      origin: { type: 'Point', coordinates: [200, 23.79] },
    });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('origin.coordinates.0');
  });

  it('rejects GeoJSON with the wrong coordinate order or arity', async () => {
    const driver = await createSession(app, { role: 'driver' });

    const res = await postRide(driver.token, {
      origin: { type: 'Point', coordinates: [23.7937] },
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown keys', async () => {
    const driver = await createSession(app, { role: 'driver' });

    const res = await postRide(driver.token, { seatsAvailable: 8 });

    expect(res.status).toBe(422);
    expect(res.body.error.details.some((d: { path: string }) => d.path === 'seatsAvailable')).toBe(
      true,
    );
  });

  it('rejects a zero-seat ride', async () => {
    const driver = await createSession(app, { role: 'driver' });

    const res = await postRide(driver.token, { seatsTotal: 0 });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('seatsTotal');
  });
});

describe('GET /rides', () => {
  it('lists rides with pagination metadata', async () => {
    const driver = await createSession(app, { role: 'driver' });
    for (let index = 0; index < 3; index += 1) {
      const created = await postRide(driver.token, { farePerSeat: 50 + index });
      expect(created.status).toBe(201);
    }

    const res = await request(app).get(`${API}/rides?page=1&limit=2`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(res.body.meta.hasNextPage).toBe(true);
  });

  it('filters by status', async () => {
    const driver = await createSession(app, { role: 'driver' });
    await postRide(driver.token);
    const second = await postRide(driver.token);
    await request(app).delete(`${API}/rides/${second.body.data.id}`).set(auth(driver.token));

    const cancelled = await request(app).get(`${API}/rides?status=cancelled`);
    const published = await request(app).get(`${API}/rides?status=published`);

    expect(cancelled.body.data).toHaveLength(1);
    expect(published.body.data).toHaveLength(1);
  });

  it('filters by a departure window', async () => {
    const driver = await createSession(app, { role: 'driver' });
    await postRide(driver.token, {
      departureAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    await postRide(driver.token, {
      departureAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

    const from = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app).get(
      `${API}/rides?dateFrom=${encodeURIComponent(from)}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('orders by distance and honours the radius when near is supplied', async () => {
    const driver = await createSession(app, { role: 'driver' });

    // Uttara (~8.4 km from Banani) and Banani (0 km).
    await postRide(driver.token, {
      origin: { type: 'Point', coordinates: [90.3948, 23.8687] },
    });
    await postRide(driver.token, { origin: { type: 'Point', coordinates: [90.4043, 23.7937] } });

    const narrow = await request(app).get(`${API}/rides?near=90.4043,23.7937&radiusMeters=6000`);
    expect(narrow.status).toBe(200);
    expect(narrow.body.data).toHaveLength(1);
    expect(narrow.body.data[0].distanceMeters).toBeLessThan(100);

    const wide = await request(app).get(`${API}/rides?near=90.4043,23.7937&radiusMeters=15000`);
    expect(wide.body.data).toHaveLength(2);
    expect(wide.body.data[0].distanceMeters).toBeLessThan(wide.body.data[1].distanceMeters);
  });

  it('rejects a near point outside Bangladesh', async () => {
    const res = await request(app).get(`${API}/rides?near=0,0`);

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('near');
  });

  it('rejects unknown query parameters', async () => {
    const res = await request(app).get(`${API}/rides?seatsAvailable=2`);

    expect(res.status).toBe(422);
  });
});

describe('GET /rides/:id', () => {
  it('returns a ride by id', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const created = await postRide(driver.token);

    const res = await request(app).get(`${API}/rides/${created.body.data.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(created.body.data.id);
  });

  it('rejects a malformed id with 422', async () => {
    const res = await request(app).get(`${API}/rides/not-an-object-id`);

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('id');
  });

  it('returns 404 for a well-formed but unknown id', async () => {
    const res = await request(app).get(`${API}/rides/64b7f1c2a1b2c3d4e5f60718`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /rides/:id', () => {
  it('allows the owner to update a ride', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const created = await postRide(driver.token);

    const res = await request(app)
      .patch(`${API}/rides/${created.body.data.id}`)
      .set(auth(driver.token))
      .send({ farePerSeat: 95, originAddress: 'Banani Bridge, Dhaka' });

    expect(res.status).toBe(200);
    expect(res.body.data.farePerSeat).toBe(95);
    expect(res.body.data.originAddress).toBe('Banani Bridge, Dhaka');
  });

  it('forbids a different authenticated user', async () => {
    const owner = await createSession(app, { role: 'driver' });
    const intruder = await createSession(app, { role: 'driver', email: 'intruder@example.com' });
    const created = await postRide(owner.token);

    const res = await request(app)
      .patch(`${API}/rides/${created.body.data.id}`)
      .set(auth(intruder.token))
      .send({ farePerSeat: 10 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 before leaking ownership for an unknown ride', async () => {
    const user = await createSession(app);

    const res = await request(app)
      .patch(`${API}/rides/64b7f1c2a1b2c3d4e5f60718`)
      .set(auth(user.token))
      .send({ farePerSeat: 10 });

    expect(res.status).toBe(404);
  });

  it('rejects an empty patch', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const created = await postRide(driver.token);

    const res = await request(app)
      .patch(`${API}/rides/${created.body.data.id}`)
      .set(auth(driver.token))
      .send({});

    expect(res.status).toBe(422);
  });

  it('refuses to shrink seats below already-booked seats', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const created = await postRide(driver.token, { seatsTotal: 4 });

    // Simulate three confirmed bookings without depending on Block 4.
    await RideModel.updateOne({ _id: created.body.data.id }, { $set: { seatsAvailable: 1 } });

    const res = await request(app)
      .patch(`${API}/rides/${created.body.data.id}`)
      .set(auth(driver.token))
      .send({ seatsTotal: 2 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');

    const ok = await request(app)
      .patch(`${API}/rides/${created.body.data.id}`)
      .set(auth(driver.token))
      .send({ seatsTotal: 3 });

    expect(ok.status).toBe(200);
    expect(ok.body.data.seatsAvailable).toBe(0);
  });

  it('refuses to edit a cancelled ride', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const created = await postRide(driver.token);
    await request(app).delete(`${API}/rides/${created.body.data.id}`).set(auth(driver.token));

    const res = await request(app)
      .patch(`${API}/rides/${created.body.data.id}`)
      .set(auth(driver.token))
      .send({ farePerSeat: 10 });

    expect(res.status).toBe(409);
  });
});

describe('DELETE /rides/:id', () => {
  it('soft-cancels a ride for the owner and is idempotent', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const created = await postRide(driver.token);

    const first = await request(app)
      .delete(`${API}/rides/${created.body.data.id}`)
      .set(auth(driver.token));
    expect(first.status).toBe(204);

    const second = await request(app)
      .delete(`${API}/rides/${created.body.data.id}`)
      .set(auth(driver.token));
    expect(second.status).toBe(204);

    const fetched = await request(app).get(`${API}/rides/${created.body.data.id}`);
    expect(fetched.body.data.status).toBe('cancelled');
    expect(fetched.body.data.cancelledAt).toBeTypeOf('string');

    // Soft delete: the document still exists for audit purposes.
    expect(await RideModel.countDocuments()).toBe(1);
  });

  it('forbids a different authenticated user', async () => {
    const owner = await createSession(app, { role: 'driver' });
    const intruder = await createSession(app, { role: 'driver', email: 'intruder2@example.com' });
    const created = await postRide(owner.token);

    const res = await request(app)
      .delete(`${API}/rides/${created.body.data.id}`)
      .set(auth(intruder.token));

    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const created = await postRide(driver.token);

    const res = await request(app).delete(`${API}/rides/${created.body.data.id}`);

    expect(res.status).toBe(401);
  });
});

describe('GET /rides/mine', () => {
  it('returns only the caller rides', async () => {
    const owner = await createSession(app, { role: 'driver' });
    const other = await createSession(app, { role: 'driver', email: 'other@example.com' });

    await postRide(owner.token);
    await postRide(other.token);

    const res = await request(app).get(`${API}/rides/mine`).set(auth(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].driverId).toBe(owner.userId);
  });

  it('requires authentication', async () => {
    const res = await request(app).get(`${API}/rides/mine`);

    expect(res.status).toBe(401);
  });
});

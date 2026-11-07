import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BookingModel } from '../src/modules/bookings/booking.model.js';
import { RideModel } from '../src/modules/rides/ride.model.js';
import { API, createSession, ridePayload, withBearer } from './helpers/factory.js';

const app = createApp();

const auth = (token: string) => ({ authorization: withBearer(token) });

const postRide = (token: string, overrides: Record<string, unknown> = {}) =>
  request(app).post(`${API}/rides`).set(auth(token)).send(ridePayload(overrides));

const book = (token: string, rideId: string, seats = 1) =>
  request(app)
    .post(`${API}/rides/${rideId}/bookings`)
    .set(auth(token))
    .send({ seats });

const confirm = (token: string, bookingId: string) =>
  request(app).post(`${API}/bookings/${bookingId}/confirm`).set(auth(token));

const cancel = (token: string, bookingId: string, body?: Record<string, unknown>) =>
  request(app)
    .post(`${API}/bookings/${bookingId}/cancel`)
    .set(auth(token))
    .send(body ?? {});

const seatsLeft = async (rideId: string): Promise<number> => {
  const ride = await RideModel.findById(rideId).lean();
  return ride!.seatsAvailable;
};

const rideStatus = async (rideId: string): Promise<string> => {
  const ride = await RideModel.findById(rideId).lean();
  return ride!.status;
};

describe('POST /rides/:rideId/bookings', () => {
  it('requires authentication', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const ride = await postRide(driver.token);

    const res = await request(app)
      .post(`${API}/rides/${ride.body.data.id}/bookings`)
      .send({ seats: 1 });

    expect(res.status).toBe(401);
  });

  it('reserves seats and returns the booking with rider and ride cards', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token, { seatsTotal: 3, farePerSeat: 80 });

    const res = await book(rider.token, ride.body.data.id, 2);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/bookings/${res.body.data.id}`);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.seats).toBe(2);
    expect(res.body.data.farePerSeat).toBe(80);
    expect(res.body.data.totalFare).toBe(160);
    expect(res.body.data.riderId).toBe(rider.userId);
    expect(res.body.data.driverId).toBe(driver.userId);
    expect(res.body.data.rider.name).toBeTypeOf('string');
    expect(res.body.data.ride.id).toBe(ride.body.data.id);
    expect(res.body.data.ride.seatsAvailable).toBe(1);

    expect(await seatsLeft(ride.body.data.id)).toBe(1);
  });

  it('marks the ride full when the last seats are taken', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token, { seatsTotal: 1 });

    const res = await book(rider.token, ride.body.data.id, 1);

    expect(res.status).toBe(201);
    expect(await seatsLeft(ride.body.data.id)).toBe(0);
    expect(await rideStatus(ride.body.data.id)).toBe('full');
  });

  it('refuses to book your own ride', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const ride = await postRide(driver.token);

    const res = await book(driver.token, ride.body.data.id, 1);

    expect(res.status).toBe(409);
    expect(await seatsLeft(ride.body.data.id)).toBe(3);
  });

  it('refuses to book a cancelled ride', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token);
    await request(app).delete(`${API}/rides/${ride.body.data.id}`).set(auth(driver.token));

    const res = await book(rider.token, ride.body.data.id, 1);

    expect(res.status).toBe(409);
  });

  it('refuses to book more seats than are free and changes nothing', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token, { seatsTotal: 2 });

    const res = await book(rider.token, ride.body.data.id, 3);

    expect(res.status).toBe(409);
    expect(await seatsLeft(ride.body.data.id)).toBe(2);
    expect(await BookingModel.countDocuments()).toBe(0);
  });

  it('rejects a duplicate active booking without double-decrementing', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token, { seatsTotal: 3 });

    const first = await book(rider.token, ride.body.data.id, 1);
    const second = await book(rider.token, ride.body.data.id, 1);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(await seatsLeft(ride.body.data.id)).toBe(2);
    expect(await BookingModel.countDocuments({ active: true })).toBe(1);
  });

  it('allows re-booking the same ride after cancelling', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token, { seatsTotal: 2 });

    const first = await book(rider.token, ride.body.data.id, 1);
    const cancelled = await cancel(rider.token, first.body.data.id);
    expect(cancelled.status).toBe(200);

    const second = await book(rider.token, ride.body.data.id, 1);

    expect(second.status).toBe(201);
    expect(await seatsLeft(ride.body.data.id)).toBe(1);
    expect(await BookingModel.countDocuments({ active: true })).toBe(1);
    // Both rows are retained: history plus the new active booking.
    expect(await BookingModel.countDocuments()).toBe(2);
  });

  it('validates the body, ride id and seat count', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token);

    const unknown = await request(app)
      .post(`${API}/rides/${ride.body.data.id}/bookings`)
      .set(auth(rider.token))
      .send({ seats: 1, farePerSeat: 1 });
    expect(unknown.status).toBe(422);

    const zero = await book(rider.token, ride.body.data.id, 0);
    expect(zero.status).toBe(422);

    const malformed = await book(rider.token, 'not-an-id', 1);
    expect(malformed.status).toBe(422);

    const missing = await book(rider.token, '64b7f1c2a1b2c3d4e5f60718', 1);
    expect(missing.status).toBe(404);
  });
});

describe('atomic seat reservation under concurrency', () => {
  it('lets exactly as many riders through as there are seats', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const riders = await Promise.all(
      Array.from({ length: 5 }, () => createSession(app)),
    );
    const ride = await postRide(driver.token, { seatsTotal: 2 });
    const rideId = ride.body.data.id as string;

    // Fire all five at once; the conditional update is the only guard.
    const results = await Promise.all(riders.map((rider) => book(rider.token, rideId, 1)));

    const created = results.filter((res) => res.status === 201);
    const rejected = results.filter((res) => res.status === 409);

    expect(created).toHaveLength(2);
    expect(rejected).toHaveLength(3);
    expect(await seatsLeft(rideId)).toBe(0);
    expect(await rideStatus(rideId)).toBe('full');
    expect(await BookingModel.countDocuments({ rideId, active: true })).toBe(2);
  });

  it('never oversells when riders request multiple seats', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const riders = await Promise.all(
      Array.from({ length: 5 }, () => createSession(app)),
    );
    const ride = await postRide(driver.token, { seatsTotal: 3 });
    const rideId = ride.body.data.id as string;

    const results = await Promise.all(riders.map((rider) => book(rider.token, rideId, 2)));

    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(results.filter((res) => res.status === 409)).toHaveLength(4);
    expect(await seatsLeft(rideId)).toBe(1);
    expect(await BookingModel.countDocuments({ rideId, active: true })).toBe(1);
  });

  it('keeps a single active booking when the same rider double-clicks', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token, { seatsTotal: 4 });
    const rideId = ride.body.data.id as string;

    const results = await Promise.all(
      Array.from({ length: 4 }, () => book(rider.token, rideId, 1)),
    );

    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(results.filter((res) => res.status === 409)).toHaveLength(3);
    // The losing inserts compensated their reservation: exactly one seat is held.
    expect(await seatsLeft(rideId)).toBe(3);
    expect(await BookingModel.countDocuments({ rideId, active: true })).toBe(1);
  });
});

describe('POST /bookings/:id/confirm', () => {
  it('lets the driver confirm a pending booking and is idempotent', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token);
    const booking = await book(rider.token, ride.body.data.id, 1);

    const first = await confirm(driver.token, booking.body.data.id);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('confirmed');
    expect(first.body.data.confirmedAt).toBeTypeOf('string');

    const second = await confirm(driver.token, booking.body.data.id);
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('confirmed');
  });

  it('forbids the rider and unrelated users from confirming', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const intruder = await createSession(app, { role: 'driver' });
    const ride = await postRide(driver.token);
    const booking = await book(rider.token, ride.body.data.id, 1);

    expect((await confirm(rider.token, booking.body.data.id)).status).toBe(403);
    expect((await confirm(intruder.token, booking.body.data.id)).status).toBe(403);
  });

  it('refuses to confirm a cancelled booking', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token);
    const booking = await book(rider.token, ride.body.data.id, 1);
    await cancel(rider.token, booking.body.data.id);

    const res = await confirm(driver.token, booking.body.data.id);

    expect(res.status).toBe(409);
  });
});

describe('POST /bookings/:id/cancel', () => {
  it('restores seats and returns the ride to published', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token, { seatsTotal: 1 });
    const rideId = ride.body.data.id as string;
    const booking = await book(rider.token, rideId, 1);

    expect(await rideStatus(rideId)).toBe('full');

    const res = await cancel(rider.token, booking.body.data.id, { reason: 'Plans changed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancellationReason).toBe('Plans changed');
    expect(await seatsLeft(rideId)).toBe(1);
    expect(await rideStatus(rideId)).toBe('published');
    expect(await BookingModel.countDocuments({ active: true })).toBe(0);
  });

  it('lets the driver cancel a rider booking', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token, { seatsTotal: 2 });
    const booking = await book(rider.token, ride.body.data.id, 1);

    const res = await cancel(driver.token, booking.body.data.id);

    expect(res.status).toBe(200);
    expect(await seatsLeft(ride.body.data.id)).toBe(2);
  });

  it('forbids unrelated users', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const intruder = await createSession(app);
    const ride = await postRide(driver.token);
    const booking = await book(rider.token, ride.body.data.id, 1);

    const res = await cancel(intruder.token, booking.body.data.id);

    expect(res.status).toBe(403);
    expect(await seatsLeft(ride.body.data.id)).toBe(2);
  });

  it('is idempotent: a second cancel does not inflate capacity', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token, { seatsTotal: 3 });
    const booking = await book(rider.token, ride.body.data.id, 2);

    expect(await seatsLeft(ride.body.data.id)).toBe(1);

    const first = await cancel(rider.token, booking.body.data.id);
    const second = await cancel(rider.token, booking.body.data.id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await seatsLeft(ride.body.data.id)).toBe(3);
  });

  it('restores seats exactly once under concurrent cancels', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const ride = await postRide(driver.token, { seatsTotal: 3 });
    const rideId = ride.body.data.id as string;
    const booking = await book(rider.token, rideId, 2);

    expect(await seatsLeft(rideId)).toBe(1);

    const [a, b] = await Promise.all([
      cancel(rider.token, booking.body.data.id),
      cancel(rider.token, booking.body.data.id),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    // Two cancels, one release: 1 + 2 = 3, never 5.
    expect(await seatsLeft(rideId)).toBe(3);
  });
});

describe('booking reads', () => {
  it('lists the rider bookings and the driver received bookings', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const other = await createSession(app);
    const ride = await postRide(driver.token, { seatsTotal: 4 });
    const rideId = ride.body.data.id as string;

    const mine = await book(rider.token, rideId, 1);
    await book(other.token, rideId, 2);

    const riderList = await request(app)
      .get(`${API}/bookings`)
      .set(auth(rider.token));

    expect(riderList.status).toBe(200);
    expect(riderList.body.data).toHaveLength(1);
    expect(riderList.body.data[0].id).toBe(mine.body.data.id);
    expect(riderList.body.data[0].ride.id).toBe(rideId);
    expect(riderList.body.meta).toMatchObject({ total: 1 });

    const received = await request(app)
      .get(`${API}/bookings/received`)
      .set(auth(driver.token));

    expect(received.status).toBe(200);
    expect(received.body.data).toHaveLength(2);
    expect(received.body.data[0].rider.name).toBeTypeOf('string');

    const filtered = await request(app)
      .get(`${API}/bookings/received?status=cancelled`)
      .set(auth(driver.token));
    expect(filtered.body.data).toHaveLength(0);
  });

  it('returns a booking to the rider, the driver and admins only', async () => {
    const driver = await createSession(app, { role: 'driver' });
    const rider = await createSession(app);
    const intruder = await createSession(app);
    const ride = await postRide(driver.token);
    const booking = await book(rider.token, ride.body.data.id, 1);

    const byRider = await request(app)
      .get(`${API}/bookings/${booking.body.data.id}`)
      .set(auth(rider.token));
    expect(byRider.status).toBe(200);

    const byDriver = await request(app)
      .get(`${API}/bookings/${booking.body.data.id}`)
      .set(auth(driver.token));
    expect(byDriver.status).toBe(200);

    const byIntruder = await request(app)
      .get(`${API}/bookings/${booking.body.data.id}`)
      .set(auth(intruder.token));
    expect(byIntruder.status).toBe(403);

    const unknown = await request(app)
      .get(`${API}/bookings/64b7f1c2a1b2c3d4e5f60718`)
      .set(auth(rider.token));
    expect(unknown.status).toBe(404);
  });

  it('requires authentication for every booking read', async () => {
    expect((await request(app).get(`${API}/bookings`)).status).toBe(401);
    expect((await request(app).get(`${API}/bookings/received`)).status).toBe(401);
    expect(
      (await request(app).get(`${API}/bookings/64b7f1c2a1b2c3d4e5f60718`)).status,
    ).toBe(401);
  });
});

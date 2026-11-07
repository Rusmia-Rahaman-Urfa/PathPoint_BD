import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('system endpoints', () => {
  it('GET /health reports liveness', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /health/ready reports the database as reachable', async () => {
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.dependencies.mongodb.connected).toBe(true);
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    expect(res.body.timestamp).toBeTypeOf('string');
  });

  it('serves a valid OpenAPI 3.1 document', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info.title).toBe('PathPoint_BD API');
    expect(res.body.paths['/api/v1/auth/register'].post).toBeDefined();
    expect(res.body.components.securitySchemes.bearerAuth).toBeDefined();
    // Generated from Zod, so the request schema must exist and be strict.
    expect(res.body.components.schemas.RegisterInput.additionalProperties).toBe(false);
  });

  it('documents the ride API from the same Zod schemas that validate it', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.paths['/api/v1/rides'].post).toBeDefined();
    expect(res.body.paths['/api/v1/rides'].get).toBeDefined();
    expect(res.body.paths['/api/v1/rides/{id}'].patch).toBeDefined();
    expect(res.body.paths['/api/v1/rides/{id}'].delete).toBeDefined();
    expect(res.body.paths['/api/v1/rides/mine'].get).toBeDefined();

    const create = res.body.components.schemas.CreateRideInput;
    expect(create.additionalProperties).toBe(false);
    expect(create.required).toEqual(
      expect.arrayContaining(['origin', 'destination', 'departureAt', 'seatsTotal', 'farePerSeat']),
    );

    // GeoJSON tuple is emitted as JSON Schema 2020-12 prefixItems, not legacy items[].
    expect(create.properties.origin.properties.coordinates.prefixItems).toHaveLength(2);
    expect(res.body.components.schemas.Ride.required).toContain('seatsAvailable');
  });

  it('documents the matching API with its score breakdown', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    const search = res.body.paths['/api/v1/matches/search'].post;
    expect(search).toBeDefined();
    expect(search.security).toEqual([{ bearerAuth: [] }]);

    const input = res.body.components.schemas.MatchSearchInput;
    expect(input.additionalProperties).toBe(false);
    expect(input.required).toEqual(
      expect.arrayContaining(['origin', 'destination', 'departureAt']),
    );

    // The output schema exposes every scoring factor, including its max.
    const card = res.body.components.schemas.MatchSearchResult.properties.matches.items;
    expect(card.properties.score).toBeDefined();
    expect(Object.keys(card.properties.breakdown.properties)).toEqual(
      expect.arrayContaining(['pickup', 'dropoff', 'time', 'bearing', 'availability']),
    );
    expect(res.body.components.schemas.MatchSearchMeta).toBeDefined();
  });

  it('documents ride requests and bookings from the same Zod schemas', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);

    expect(res.body.paths['/api/v1/matches/requests'].post).toBeDefined();
    expect(res.body.paths['/api/v1/matches/requests'].get).toBeDefined();
    expect(res.body.paths['/api/v1/matches/requests/mine'].get).toBeDefined();
    expect(res.body.paths['/api/v1/matches/requests/reverse'].get).toBeDefined();
    expect(res.body.paths['/api/v1/matches/requests/{id}'].delete).toBeDefined();

    expect(res.body.paths['/api/v1/rides/{rideId}/bookings'].post).toBeDefined();
    expect(res.body.paths['/api/v1/bookings'].get).toBeDefined();
    expect(res.body.paths['/api/v1/bookings/received'].get).toBeDefined();
    expect(res.body.paths['/api/v1/bookings/{id}/confirm'].post).toBeDefined();
    expect(res.body.paths['/api/v1/bookings/{id}/cancel'].post).toBeDefined();

    const createRequest = res.body.components.schemas.CreateRideRequestInput;
    expect(createRequest.additionalProperties).toBe(false);
    expect(createRequest.required).toEqual(
      expect.arrayContaining(['origin', 'destination', 'departureAt']),
    );

    const createBooking = res.body.components.schemas.CreateBookingInput;
    expect(createBooking.additionalProperties).toBe(false);
    expect(createBooking.properties.seats).toBeDefined();

    const booking = res.body.components.schemas.Booking;
    expect(booking.required).toEqual(
      expect.arrayContaining(['rideId', 'riderId', 'driverId', 'seats', 'status']),
    );
    expect(res.body.components.schemas.RideRequestReverseMeta).toBeDefined();

    expect(res.body.paths['/api/v1/traffic/stream'].get).toBeDefined();
    expect(res.body.paths['/api/v1/traffic/events'].get).toBeDefined();
    expect(res.body.paths['/api/v1/traffic/simulate'].post).toBeDefined();
    expect(
      res.body.paths['/api/v1/traffic/stream'].get.responses['200'].content['text/event-stream'],
    ).toBeDefined();
    expect(res.body.components.schemas.TrafficEvent).toBeDefined();
  });

  it('serves the interactive Scalar reference at /docs', async () => {
    const res = await request(app).get('/docs');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text.toLowerCase()).toContain('scalar');
  });

  it('honours a caller supplied request id', async () => {
    const res = await request(app).get('/health').set('x-request-id', 'trace-abc-123');

    expect(res.headers['x-request-id']).toBe('trace-abc-123');
  });
});

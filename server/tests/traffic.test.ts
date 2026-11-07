import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { SseHub } from '../src/lib/sse/SseHub.js';
import { trafficHub } from '../src/modules/traffic/traffic.sse.js';
import { trafficService } from '../src/modules/traffic/traffic.service.js';
import { API, createSession, withBearer } from './helpers/factory.js';

const app = createApp();

const auth = (token: string) => ({ authorization: withBearer(token) });

beforeEach(() => {
  trafficService.clear();
  trafficService.stop();
});

afterEach(() => {
  trafficHub.closeAll('test cleanup');
  trafficService.clear();
});

describe('traffic reads', () => {
  it('starts empty and reports simulator state', async () => {
    const events = await request(app).get(`${API}/traffic/events`);
    expect(events.status).toBe(200);
    expect(events.body.data).toEqual([]);
    expect(events.body.meta).toMatchObject({
      total: 0,
      clients: 0,
      simulatorRunning: false,
    });

    const stats = await request(app).get(`${API}/traffic/stats`);
    expect(stats.status).toBe(200);
    expect(stats.body.data).toMatchObject({
      clients: 0,
      bufferedEvents: 0,
      simulatorRunning: false,
      cities: ['dhaka', 'chattogram'],
      levels: ['free', 'moderate', 'heavy', 'severe'],
    });
  });

  it('buffers simulated events and filters by city and level', async () => {
    trafficService.simulate({ city: 'dhaka', corridor: 'Banani → Dhanmondi', level: 'heavy' });
    trafficService.simulate({ city: 'chattogram', corridor: 'GEC → Agrabad', level: 'free' });
    trafficService.simulate({ city: 'dhaka', corridor: 'Uttara → Banani', level: 'free' });

    const all = await request(app).get(`${API}/traffic/events`);
    expect(all.body.data).toHaveLength(3);
    expect(all.body.data[0].corridor).toBe('Uttara → Banani');
    expect(all.body.data[0].source).toBe('manual');

    const dhaka = await request(app).get(`${API}/traffic/events?city=dhaka`);
    expect(dhaka.body.data).toHaveLength(2);
    expect(dhaka.body.data.every((e: { city: string }) => e.city === 'dhaka')).toBe(true);

    const free = await request(app).get(`${API}/traffic/events?level=free`);
    expect(free.body.data).toHaveLength(2);

    const limited = await request(app).get(`${API}/traffic/events?limit=1`);
    expect(limited.body.data).toHaveLength(1);
  });

  it('rejects unknown filters', async () => {
    const res = await request(app).get(`${API}/traffic/events?city=atlantis`);
    expect(res.status).toBe(422);
  });
});

describe('POST /traffic/simulate', () => {
  it('requires authentication', async () => {
    const res = await request(app).post(`${API}/traffic/simulate`).send({});

    expect(res.status).toBe(401);
    expect(trafficService.list({ limit: 10 })).toHaveLength(0);
  });

  it('emits a manual event with explicit fields', async () => {
    const user = await createSession(app);

    const res = await request(app)
      .post(`${API}/traffic/simulate`)
      .set(auth(user.token))
      .send({ city: 'chattogram', corridor: 'GEC → Agrabad', level: 'severe' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      city: 'chattogram',
      corridor: 'GEC → Agrabad',
      level: 'severe',
      source: 'manual',
    });
    expect(res.body.data.id).toBeTypeOf('string');
    expect(res.body.data.speedKph).toBeLessThanOrEqual(10);
    expect(res.body.data.delayMinutes).toBeGreaterThanOrEqual(35);
    expect(trafficService.list({ limit: 10 })).toHaveLength(1);
  });

  it('fills omitted fields at random', async () => {
    const user = await createSession(app);

    const res = await request(app)
      .post(`${API}/traffic/simulate`)
      .set(auth(user.token))
      .send({ city: 'dhaka' });

    expect(res.status).toBe(201);
    expect(res.body.data.city).toBe('dhaka');
    expect(['free', 'moderate', 'heavy', 'severe']).toContain(res.body.data.level);
    expect(res.body.data.corridor).toBeTypeOf('string');
  });

  it('rejects unknown keys and invalid levels', async () => {
    const user = await createSession(app);

    const unknown = await request(app)
      .post(`${API}/traffic/simulate`)
      .set(auth(user.token))
      .send({ city: 'dhaka', speedKph: 10 });
    expect(unknown.status).toBe(422);

    const bad = await request(app)
      .post(`${API}/traffic/simulate`)
      .set(auth(user.token))
      .send({ level: 'gridlock' });
    expect(bad.status).toBe(422);
  });
});

describe('SseHub', () => {
  interface FakeResponse {
    chunks: string[];
    headers: Record<string, string>;
    statusCode?: number;
    writableEnded: boolean;
    status(code: number): FakeResponse;
    setHeader(name: string, value: string): FakeResponse;
    flushHeaders(): void;
    write(chunk: string): boolean;
    end(): void;
    on(): void;
  }

  const fakeResponse = (): FakeResponse => ({
    chunks: [],
    headers: {},
    writableEnded: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = String(value);
      return this;
    },
    flushHeaders() {},
    write(chunk) {
      this.chunks.push(chunk);
      return true;
    },
    end() {
      this.writableEnded = true;
    },
    on() {},
  });

  const fakeRequest = { on() {} };

  it('writes SSE frames and honours per-client filters', () => {
    const hub = new SseHub({ heartbeatMs: 60_000 });
    const dhakaOnly = fakeResponse();
    const everyone = fakeResponse();

    hub.subscribe(fakeRequest as never, dhakaOnly as never, {
      filter: (event) => (event.data as { city: string }).city === 'dhaka',
    });
    hub.subscribe(fakeRequest as never, everyone as never);

    expect(dhakaOnly.headers['content-type']).toContain('text/event-stream');
    expect(dhakaOnly.chunks[0]).toContain('retry: 3000');
    expect(dhakaOnly.chunks.join('')).toContain('event: connected');

    hub.publish({ event: 'traffic', id: 'evt-1', data: { city: 'chattogram', level: 'free' } });
    hub.publish({ event: 'traffic', id: 'evt-2', data: { city: 'dhaka', level: 'heavy' } });

    const dhakaFrames = dhakaOnly.chunks.join('');
    const allFrames = everyone.chunks.join('');

    expect(dhakaFrames).not.toContain('evt-1');
    expect(dhakaFrames).toContain('evt-2');
    expect(allFrames).toContain('evt-1');
    expect(allFrames).toContain('evt-2');

    hub.closeAll('bye');
    expect(dhakaOnly.chunks.join('')).toContain('event: shutdown');
    expect(dhakaOnly.writableEnded).toBe(true);
    expect(hub.clientCount).toBe(0);
  });
});

describe('SSE stream', () => {
  it('streams connected and traffic events with SSE headers', async () => {
    const server: Server = createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const controller = new AbortController();

    try {
      const response = await fetch(`http://127.0.0.1:${port}${API}/traffic/stream?city=dhaka`, {
        signal: controller.signal,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      expect(response.headers.get('cache-control')).toContain('no-cache');

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const readUntil = async (needle: string): Promise<void> => {
        const deadline = Date.now() + 5_000;
        while (!buffer.includes(needle)) {
          if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for ${needle}. Received: ${buffer}`);
          }
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
        }
      };

      await readUntil('event: connected');

      // Filtered out: wrong city.
      trafficService.simulate({ city: 'chattogram', level: 'severe' });
      // Delivered.
      trafficService.simulate({ city: 'dhaka', corridor: 'Banani → Dhanmondi', level: 'heavy' });

      await readUntil('event: traffic');

      expect(buffer).toContain('"city":"dhaka"');
      expect(buffer).toContain('"level":"heavy"');
      expect(buffer).not.toContain('"level":"severe"');

      await reader.cancel().catch(() => undefined);
    } finally {
      controller.abort();
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

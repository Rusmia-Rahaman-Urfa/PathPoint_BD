import request from 'supertest';
import type { Express } from 'express';

export const API = '/api/v1';

export const validRegistration = (overrides: Record<string, unknown> = {}) => ({
  name: 'Ayesha Rahman',
  email: 'ayesha@example.com',
  phone: '+8801712345678',
  password: 'Dhaka2026',
  role: 'rider',
  ...overrides,
});

export const registerUser = (app: Express, overrides: Record<string, unknown> = {}) =>
  request(app).post(`${API}/auth/register`).send(validRegistration(overrides));

export const loginUser = (app: Express, email: string, password: string) =>
  request(app).post(`${API}/auth/login`).send({ email, password });

export const withBearer = (token: string): string => `Bearer ${token}`;

export const ridePayload = (overrides: Record<string, unknown> = {}) => ({
  origin: { type: 'Point', coordinates: [90.4043, 23.7937] }, // Banani
  destination: { type: 'Point', coordinates: [90.3742, 23.7461] }, // Dhanmondi 27
  originAddress: 'Banani, Dhaka',
  destinationAddress: 'Dhanmondi 27, Dhaka',
  departureAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  seatsTotal: 3,
  farePerSeat: 80,
  vehicle: {
    make: 'Toyota',
    model: 'Corolla',
    plate: 'DHAKA METRO-GA-12-3456',
    ac: true,
  },
  ...overrides,
});

/** Registers a fresh account and returns its access token + user id. */
let sessionCounter = 0;

export async function createSession(
  app: Express,
  overrides: Record<string, unknown> = {},
): Promise<{ token: string; userId: string; email: string }> {
  const suffix = `${Date.now()}`.slice(-6) + String(sessionCounter++).padStart(2, '0');
  const email = (overrides.email as string) ?? `user-${suffix}@example.com`;
  const res = await registerUser(app, {
    // Phone numbers are unique in the schema, so every test session needs its own.
    phone: `+88018${suffix}`,
    ...overrides,
    email,
  });

  if (res.status !== 201) {
    throw new Error(`Failed to create test session: ${JSON.stringify(res.body)}`);
  }

  return {
    token: res.body.data.accessToken as string,
    userId: res.body.data.user.id as string,
    email,
  };
}

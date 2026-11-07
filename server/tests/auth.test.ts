import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { API, loginUser, registerUser, validRegistration, withBearer } from './helpers/factory.js';

const app = createApp();

describe('POST /auth/register', () => {
  it('creates an account and returns a usable access token', async () => {
    const res = await registerUser(app);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('ayesha@example.com');
    expect(res.body.data.user.role).toBe('rider');
    expect(res.body.data.accessToken).toBeTypeOf('string');
    expect(res.body.data.tokenType).toBe('Bearer');
    // Password material must never leave the service.
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.password).toBeUndefined();

    const me = await request(app)
      .get(`${API}/auth/me`)
      .set('authorization', withBearer(res.body.data.accessToken));

    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(res.body.data.user.id);
  });

  it('normalises email casing', async () => {
    const res = await registerUser(app, { email: 'Ayesha@Example.COM' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('ayesha@example.com');

    const duplicate = await registerUser(app, { email: 'ayesha@example.com', phone: undefined });
    expect(duplicate.status).toBe(409);
  });

  it('rejects a duplicate email with 409', async () => {
    await registerUser(app);

    const res = await registerUser(app, { phone: '+8801812345678' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects a duplicate phone with 409', async () => {
    await registerUser(app);

    const res = await registerUser(app, { email: 'other@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects unknown keys instead of silently ignoring them', async () => {
    const res = await registerUser(app, { isAdmin: true });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.some((d: { path: string }) => d.path === 'isAdmin')).toBe(true);
  });

  it('refuses self-registration as admin', async () => {
    const res = await registerUser(app, { role: 'admin' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces the password policy', async () => {
    const res = await registerUser(app, { password: 'allletters' });

    expect(res.status).toBe(422);
    expect(res.body.error.details.some((d: { path: string }) => d.path === 'password')).toBe(true);
  });

  it('validates the email format', async () => {
    const res = await registerUser(app, { email: 'not-an-email' });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('email');
  });

  it('validates the Bangladeshi phone format', async () => {
    const res = await registerUser(app, { phone: '01712345678' });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('phone');
  });

  it('rejects a malformed JSON body with 400', async () => {
    const res = await request(app)
      .post(`${API}/auth/register`)
      .set('content-type', 'application/json')
      .send('{"name": "broken"');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

describe('POST /auth/login', () => {
  it('returns a token for valid credentials', async () => {
    await registerUser(app);

    const res = await loginUser(app, 'ayesha@example.com', 'Dhaka2026');

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTypeOf('string');
    expect(res.body.data.user.email).toBe('ayesha@example.com');
  });

  it('returns the same 401 for a wrong password and an unknown email', async () => {
    await registerUser(app);

    const wrongPassword = await loginUser(app, 'ayesha@example.com', 'WrongPass123');
    const unknownEmail = await loginUser(app, 'ghost@example.com', 'WrongPass123');

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('rejects an invalid email shape with 422', async () => {
    const res = await loginUser(app, 'nope', 'Dhaka2026');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /auth/me', () => {
  it('requires a bearer token', async () => {
    const res = await request(app).get(`${API}/auth/me`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a garbage token', async () => {
    const res = await request(app)
      .get(`${API}/auth/me`)
      .set('authorization', withBearer('not.a.real.jwt'));

    expect(res.status).toBe(401);
  });

  it('rejects a non-bearer scheme', async () => {
    const res = await request(app).get(`${API}/auth/me`).set('authorization', 'Basic abc123');

    expect(res.status).toBe(401);
  });

  it('returns the profile for the authenticated user', async () => {
    const registered = await registerUser(app);

    const res = await request(app)
      .get(`${API}/auth/me`)
      .set('authorization', withBearer(registered.body.data.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe(validRegistration().name);
    expect(res.body.data.passwordHash).toBeUndefined();
  });
});

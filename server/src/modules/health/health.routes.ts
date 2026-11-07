import { Router } from 'express';
import { env } from '../../config/env.js';
import { API_VERSION } from '../../config/constants.js';
import { dbStatus } from '../../config/db.js';
import { ApiError } from '../../lib/ApiError.js';
import { sendSuccess } from '../../lib/ApiResponse.js';

export const healthRouter = Router();

const uptimeSeconds = (): number => Math.round(process.uptime());

/** Liveness: the process is up and serving. Never touches the database. */
healthRouter.get('/', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    service: 'pathpoint-bd-api',
    version: API_VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: uptimeSeconds(),
  });
});

/** Readiness: only 200 when Mongo is actually usable. */
healthRouter.get('/ready', (_req, res) => {
  const db = dbStatus();

  if (!db.connected) {
    throw ApiError.serviceUnavailable('Database is not connected');
  }

  sendSuccess(res, {
    status: 'ready',
    version: API_VERSION,
    uptimeSeconds: uptimeSeconds(),
    dependencies: { mongodb: db },
  });
});

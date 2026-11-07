import { Router } from 'express';
import { env } from '../config/env.js';
import { API_VERSION } from '../config/constants.js';
import { sendSuccess } from '../lib/ApiResponse.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { rideRouter } from '../modules/rides/ride.routes.js';
import { matchingRouter } from '../modules/matching/matching.routes.js';
import { rideRequestRouter } from '../modules/requests/rideRequest.routes.js';
import { bookingRouter, rideBookingRouter } from '../modules/bookings/booking.routes.js';
import { trafficRouter } from '../modules/traffic/traffic.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);

// `/rides/:rideId/bookings` must be registered before the `/rides` router so
// the nested resource never falls through to the `/:id` handlers.
apiRouter.use('/rides/:rideId/bookings', rideBookingRouter);
apiRouter.use('/rides', rideRouter);

// `/matches/requests` is a more specific mount than `/matches`.
apiRouter.use('/matches/requests', rideRequestRouter);
apiRouter.use('/matches', matchingRouter);

apiRouter.use('/bookings', bookingRouter);
apiRouter.use('/traffic', trafficRouter);

/** Small discovery endpoint so evaluators can see the contract at a glance. */
apiRouter.get('/meta', (_req, res) => {
  sendSuccess(res, {
    name: 'PathPoint_BD API',
    version: API_VERSION,
    environment: env.NODE_ENV,
    documentation: '/docs',
    openapi: '/openapi.json',
    modules: [
      'auth',
      'users',
      'rides',
      'matching',
      'requests',
      'bookings',
      'traffic (SSE)',
    ],
  });
});

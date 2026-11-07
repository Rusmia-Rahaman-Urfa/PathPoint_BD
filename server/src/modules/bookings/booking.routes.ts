import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { bookingController } from './booking.controller.js';
import {
  bookingIdParamSchema,
  cancelBookingSchema,
  createBookingSchema,
  listBookingsQuerySchema,
  rideBookingParamSchema,
} from './booking.schemas.js';

/**
 * Mounted at `/rides/:rideId/bookings`. `mergeParams` is required so the
 * controller can read the parent ride id from `req.params`.
 */
export const rideBookingRouter = Router({ mergeParams: true });

rideBookingRouter.post(
  '/',
  authenticate,
  validate({ params: rideBookingParamSchema, body: createBookingSchema }),
  bookingController.create,
);

/** Mounted at `/bookings`. */
export const bookingRouter = Router();

// Static paths before `/:id`.
bookingRouter.get(
  '/received',
  authenticate,
  validate({ query: listBookingsQuerySchema }),
  bookingController.listReceived,
);

bookingRouter.get(
  '/',
  authenticate,
  validate({ query: listBookingsQuerySchema }),
  bookingController.listMine,
);

bookingRouter.get(
  '/:id',
  authenticate,
  validate({ params: bookingIdParamSchema }),
  bookingController.getById,
);

bookingRouter.post(
  '/:id/confirm',
  authenticate,
  validate({ params: bookingIdParamSchema }),
  bookingController.confirm,
);

bookingRouter.post(
  '/:id/cancel',
  authenticate,
  validate({ params: bookingIdParamSchema, body: cancelBookingSchema }),
  bookingController.cancel,
);

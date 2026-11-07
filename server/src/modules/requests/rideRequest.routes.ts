import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { rideRequestController } from './rideRequest.controller.js';
import {
  createRideRequestSchema,
  listRideRequestsQuerySchema,
  reverseMatchQuerySchema,
  rideRequestIdParamSchema,
} from './rideRequest.schemas.js';

export const rideRequestRouter = Router();

// Static paths before `/:id`, otherwise "mine"/"reverse" look like ObjectIds.
rideRequestRouter.get(
  '/mine',
  authenticate,
  validate({ query: listRideRequestsQuerySchema }),
  rideRequestController.listMine,
);

rideRequestRouter.get(
  '/reverse',
  authenticate,
  validate({ query: reverseMatchQuerySchema }),
  rideRequestController.reverse,
);

rideRequestRouter.post(
  '/',
  authenticate,
  validate({ body: createRideRequestSchema }),
  rideRequestController.create,
);

rideRequestRouter.get(
  '/',
  authenticate,
  validate({ query: listRideRequestsQuerySchema }),
  rideRequestController.list,
);

rideRequestRouter.get(
  '/:id',
  authenticate,
  validate({ params: rideRequestIdParamSchema }),
  rideRequestController.getById,
);

rideRequestRouter.delete(
  '/:id',
  authenticate,
  validate({ params: rideRequestIdParamSchema }),
  rideRequestController.cancel,
);

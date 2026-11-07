import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { rideController } from './ride.controller.js';
import {
  createRideSchema,
  listRidesQuerySchema,
  rideIdParamSchema,
  updateRideSchema,
} from './ride.schemas.js';

export const rideRouter = Router();

// Static paths must be registered before the `/:id` wildcard.
rideRouter.get(
  '/mine',
  authenticate,
  validate({ query: listRidesQuerySchema }),
  rideController.listMine,
);

rideRouter.post('/', authenticate, validate({ body: createRideSchema }), rideController.create);

rideRouter.get('/', validate({ query: listRidesQuerySchema }), rideController.list);

rideRouter.get(
  '/:id',
  validate({ params: rideIdParamSchema }),
  rideController.getById,
);

rideRouter.patch(
  '/:id',
  authenticate,
  validate({ params: rideIdParamSchema, body: updateRideSchema }),
  rideController.update,
);

rideRouter.delete(
  '/:id',
  authenticate,
  validate({ params: rideIdParamSchema }),
  rideController.cancel,
);

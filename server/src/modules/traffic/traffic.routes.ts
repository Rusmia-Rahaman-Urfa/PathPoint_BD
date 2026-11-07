import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { trafficController } from './traffic.controller.js';
import {
  listTrafficQuerySchema,
  simulateTrafficSchema,
  trafficStreamQuerySchema,
} from './traffic.schemas.js';

export const trafficRouter = Router();

// Public reads: EventSource cannot attach an Authorization header.
trafficRouter.get(
  '/stream',
  validate({ query: trafficStreamQuerySchema }),
  trafficController.stream,
);

trafficRouter.get(
  '/events',
  validate({ query: listTrafficQuerySchema }),
  trafficController.recent,
);

trafficRouter.get('/stats', trafficController.stats);

// Authenticated write: lets a demo trigger a visible event on demand.
trafficRouter.post(
  '/simulate',
  authenticate,
  validate({ body: simulateTrafficSchema }),
  trafficController.simulate,
);

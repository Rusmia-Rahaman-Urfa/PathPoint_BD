import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { matchingController } from './matching.controller.js';
import { matchSearchSchema } from './matching.schemas.js';

export const matchingRouter = Router();

matchingRouter.post(
  '/search',
  authenticate,
  validate({ body: matchSearchSchema }),
  matchingController.search,
);

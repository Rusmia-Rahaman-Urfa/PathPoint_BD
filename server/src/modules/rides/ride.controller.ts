import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendNoContent, sendSuccess } from '../../lib/ApiResponse.js';
import { rideService } from './ride.service.js';
import type { CreateRideInput, ListRidesQuery, UpdateRideInput } from './ride.schemas.js';

export const rideController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const ride = await rideService.create(req.body as CreateRideInput, req.user!);
    res.setHeader('Location', `/api/v1/rides/${ride.id}`);
    sendSuccess(res, ride, { statusCode: 201 });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await rideService.list(req.query as unknown as ListRidesQuery);
    sendSuccess(res, items, { meta });
  }),

  listMine: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await rideService.listMine(
      req.user!,
      req.query as unknown as ListRidesQuery,
    );
    sendSuccess(res, items, { meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const ride = await rideService.getById(req.params.id as string);
    sendSuccess(res, ride);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const ride = await rideService.update(
      req.params.id as string,
      req.body as UpdateRideInput,
      req.user!,
    );
    sendSuccess(res, ride);
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    await rideService.cancel(req.params.id as string, req.user!);
    sendNoContent(res);
  }),
};

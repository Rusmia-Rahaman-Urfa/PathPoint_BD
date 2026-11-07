import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendSuccess } from '../../lib/ApiResponse.js';
import { rideRequestService } from './rideRequest.service.js';
import type {
  CreateRideRequestInput,
  ListRideRequestsQuery,
  ReverseMatchQuery,
} from './rideRequest.schemas.js';

export const rideRequestController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const request = await rideRequestService.create(
      req.body as CreateRideRequestInput,
      req.user!,
    );
    res.setHeader('Location', `/api/v1/matches/requests/${request.id}`);
    sendSuccess(res, request, { statusCode: 201 });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await rideRequestService.list(
      req.query as unknown as ListRideRequestsQuery,
    );
    sendSuccess(res, items, { meta });
  }),

  listMine: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await rideRequestService.listMine(
      req.user!,
      req.query as unknown as ListRideRequestsQuery,
    );
    sendSuccess(res, items, { meta });
  }),

  reverse: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await rideRequestService.findReverseMatches(
      req.query as unknown as ReverseMatchQuery,
      req.user!,
    );
    sendSuccess(res, items, { meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const request = await rideRequestService.getById(String(req.params.id), req.user!);
    sendSuccess(res, request);
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    const request = await rideRequestService.cancel(String(req.params.id), req.user!);
    sendSuccess(res, request);
  }),
};

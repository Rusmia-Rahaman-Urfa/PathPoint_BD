import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendSuccess } from '../../lib/ApiResponse.js';
import { bookingService } from './booking.service.js';
import type {
  CancelBookingInput,
  CreateBookingInput,
  ListBookingsQuery,
} from './booking.schemas.js';

export const bookingController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const booking = await bookingService.create(
      String(req.params.rideId),
      req.body as CreateBookingInput,
      req.user!,
    );
    res.setHeader('Location', `/api/v1/bookings/${booking.id}`);
    sendSuccess(res, booking, { statusCode: 201 });
  }),

  listMine: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await bookingService.listMine(
      req.user!,
      req.query as unknown as ListBookingsQuery,
    );
    sendSuccess(res, items, { meta });
  }),

  listReceived: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await bookingService.listReceived(
      req.user!,
      req.query as unknown as ListBookingsQuery,
    );
    sendSuccess(res, items, { meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const booking = await bookingService.getById(String(req.params.id), req.user!);
    sendSuccess(res, booking);
  }),

  confirm: asyncHandler(async (req: Request, res: Response) => {
    const booking = await bookingService.confirm(String(req.params.id), req.user!);
    sendSuccess(res, booking);
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CancelBookingInput;
    const booking = await bookingService.cancel(
      String(req.params.id),
      req.user!,
      body.reason,
    );
    sendSuccess(res, booking);
  }),
};

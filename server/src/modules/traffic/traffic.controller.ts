import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendSuccess } from '../../lib/ApiResponse.js';
import { trafficHub } from './traffic.sse.js';
import { trafficService } from './traffic.service.js';
import type {
  ListTrafficQuery,
  SimulateTrafficInput,
  TrafficEvent,
  TrafficStreamQuery,
} from './traffic.schemas.js';

export const trafficController = {
  /**
   * Public SSE stream. Writes are authenticated; reads are not, so an
   * EventSource (which cannot send Authorization headers) works out of the box.
   */
  stream: (req: Request, res: Response): void => {
    const { city } = req.query as unknown as TrafficStreamQuery;

    trafficHub.subscribe(req, res, {
      ...(city
        ? {
            filter: (event) => (event.data as TrafficEvent).city === city,
          }
        : {}),
    });
  },

  recent: asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListTrafficQuery;
    const events = trafficService.list(query);
    const stats = trafficService.stats();

    sendSuccess(res, events, {
      meta: {
        total: events.length,
        clients: stats.clients,
        simulatorRunning: stats.simulatorRunning,
        intervalMs: stats.intervalMs,
      },
    });
  }),

  stats: asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, trafficService.stats());
  }),

  simulate: asyncHandler(async (req: Request, res: Response) => {
    const event = trafficService.simulate(req.body as SimulateTrafficInput);
    sendSuccess(res, event, { statusCode: 201 });
  }),
};

import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendSuccess } from '../../lib/ApiResponse.js';
import { matchingService } from './matching.service.js';
import type { MatchSearchInput } from './matching.schemas.js';

export const matchingController = {
  search: asyncHandler(async (req: Request, res: Response) => {
    const { query, matches, meta } = await matchingService.search(
      req.body as MatchSearchInput,
      req.user!,
    );

    sendSuccess(res, { query, matches }, { meta });
  }),
};

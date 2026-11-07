import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendSuccess } from '../../lib/ApiResponse.js';
import { authService } from './auth.service.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

/** Thin transport layer: no business logic, no direct model access. */
export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as RegisterInput;
    const result = await authService.register(input);
    sendSuccess(res, result, { statusCode: 201 });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as LoginInput;
    const result = await authService.login(input);
    sendSuccess(res, result);
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.getProfile(req.user!.id);
    sendSuccess(res, user);
  }),
};

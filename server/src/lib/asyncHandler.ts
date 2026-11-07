import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Express 5 forwards rejected promises on its own, but wrapping keeps the
 * intent explicit, keeps Express 4 compatibility, and gives us one place to
 * reason about async failures.
 */
export const asyncHandler = (handler: AsyncHandler): RequestHandler => {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
};

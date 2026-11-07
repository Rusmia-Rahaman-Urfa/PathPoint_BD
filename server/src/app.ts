import express, { type Express, type Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { requestId } from './middleware/requestId.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';
import { docsRouter } from './routes/docs.routes.js';
import { healthRouter } from './modules/health/health.routes.js';

const corsOrigin = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
): void => {
  // No Origin header: curl, server-to-server, same-origin SSE.
  if (!origin) {
    callback(null, true);
    return;
  }
  callback(null, env.corsOrigins.includes(origin));
};

/**
 * App factory. Keeping `listen()` out of here makes the whole HTTP surface
 * testable with supertest and reusable in serverless environments.
 */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1); // Render sits behind a proxy; needed for rate limiting + SSE IPs
  app.disable('x-powered-by');

  app.use(requestId);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request).requestId,
      autoLogging: {
        ignore: (req) => req.url === '/health' || req.url === '/health/ready',
      },
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // CSP is disabled because the Scalar reference ships its own inline bundle;
  // every other helmet protection stays on.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

  app.use(
    cors({
      origin: corsOrigin,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      credentials: false,
      maxAge: 86_400,
    }),
  );

  app.use(express.json({ limit: '16kb' }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));

  app.use(globalLimiter);

  // Operational + documentation surfaces sit outside the versioned API.
  app.use('/health', healthRouter);
  app.use(docsRouter);

  // Versioned business API.
  app.use(env.API_PREFIX, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

import { createServer, type Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB, registerDbEvents } from './config/db.js';
import { logger } from './lib/logger.js';
import { trafficHub } from './modules/traffic/traffic.sse.js';
import { trafficService } from './modules/traffic/traffic.service.js';

const app = createApp();
const server: Server = createServer(app);

registerDbEvents();

server.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, environment: env.NODE_ENV, api: env.API_PREFIX, docs: '/docs' },
    'pathpoint-bd api listening',
  );
});

// Connect after listening so Render's liveness probe answers immediately
// while Atlas completes its handshake.
void connectDB();

if (env.TRAFFIC_SIM_ENABLED) {
  trafficService.start();
  logger.info({ intervalMs: trafficService.interval }, 'traffic simulator started');
}

let shuttingDown = false;

async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, 'shutting down');

  // Hard stop if something refuses to close.
  const forceExit = setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  trafficService.stop();
  trafficHub.closeAll('server shutting down');

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  try {
    await disconnectDB();
  } catch (error) {
    logger.error({ err: error }, 'error while closing mongodb connection');
  }

  logger.info('shutdown complete');
  process.exit(exitCode);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  void shutdown('uncaughtException', 1);
});

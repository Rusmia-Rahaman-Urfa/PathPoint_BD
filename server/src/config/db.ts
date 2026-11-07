import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../lib/logger.js';

mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true); // blocks $where / operator injection in user input

const MAX_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 2_000;

export const isDbConnected = (): boolean => mongoose.connection.readyState === 1;

const stateNames: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export function registerDbEvents(): void {
  mongoose.connection.on('connected', () => logger.info('mongodb: connected'));
  mongoose.connection.on('disconnected', () => logger.warn('mongodb: disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('mongodb: reconnected'));
  mongoose.connection.on('error', (error) => logger.error({ err: error }, 'mongodb: connection error'));
}

/**
 * Connect with bounded exponential backoff. We deliberately do NOT exit the
 * process on failure: Render's health check should still answer while Atlas
 * wakes up, and /health/ready reports the degraded state honestly.
 */
export async function connectDB(uri: string = env.MONGODB_URI): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8_000,
        maxPoolSize: 10,
        minPoolSize: 0,
      });
      logger.info({ state: stateNames[mongoose.connection.readyState] }, 'mongodb: ready');
      return;
    } catch (error) {
      const delay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
      logger.error(
        { attempt, maxAttempts: MAX_ATTEMPTS, retryInMs: delay, err: error },
        'mongodb: connection attempt failed',
      );
      if (attempt === MAX_ATTEMPTS) {
        logger.error('mongodb: giving up; API will run in degraded mode (/health/ready -> 503)');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close(false);
  logger.info('mongodb: connection closed');
}

export function dbStatus(): { connected: boolean; state: string; name: string | null } {
  return {
    connected: isDbConnected(),
    state: stateNames[mongoose.connection.readyState] ?? 'unknown',
    name: mongoose.connection.name ?? null,
  };
}

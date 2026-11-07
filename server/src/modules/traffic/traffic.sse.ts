import { env } from '../../config/env.js';
import { SseHub } from '../../lib/sse/SseHub.js';

/**
 * One hub per process. Kept in its own module so the traffic service and the
 * HTTP layer share the same instance without importing each other.
 */
export const trafficHub = new SseHub({ heartbeatMs: env.SSE_HEARTBEAT_MS });

import { errorResponse, successEnvelope } from '../registry.js';

export const systemPaths = {
  '/health': {
    get: {
      tags: ['System'],
      summary: 'Liveness probe',
      description: 'Always 200 while the process is serving. Does not touch MongoDB.',
      operationId: 'health',
      responses: {
        200: successEnvelope('Health', 'Process is alive'),
      },
    },
  },
  '/health/ready': {
    get: {
      tags: ['System'],
      summary: 'Readiness probe',
      description: 'Returns 200 only when MongoDB is connected, otherwise 503.',
      operationId: 'healthReady',
      responses: {
        200: successEnvelope('Readiness', 'Database is reachable'),
        503: errorResponse('Database is not connected'),
      },
    },
  },
} as const;

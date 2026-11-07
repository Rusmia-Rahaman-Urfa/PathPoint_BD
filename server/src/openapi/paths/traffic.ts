import { env } from '../../config/env.js';
import { listTrafficQuerySchema } from '../../modules/traffic/traffic.schemas.js';
import {
  errorResponse,
  jsonBody,
  metaArrayEnvelope,
  queryParameters,
  successEnvelope,
} from '../registry.js';

const prefix = `${env.API_PREFIX}/traffic`;

export const trafficPaths = {
  [`${prefix}/stream`]: {
    get: {
      tags: ['Traffic'],
      summary: 'Subscribe to the live congestion stream (SSE)',
      description: [
        'Public **Server-Sent Events** stream. `EventSource` cannot set an `Authorization`',
        'header, so reads are unauthenticated while writes (`/traffic/simulate`) require a JWT.',
        '',
        'Frames:',
        '- `event: connected` - `{ clientId, connectedAt, heartbeatMs }`',
        '- `event: traffic` - a `TrafficEvent` (`id` is also the SSE event id)',
        '- `event: shutdown` - sent when the server drains',
        '- `: ping` comment every `SSE_HEARTBEAT_MS` keeps proxies awake',
        '',
        '`Last-Event-ID` replay is intentionally not implemented: the simulator is a',
        'live demo feed, and `/traffic/events` serves the recent buffer for late joiners.',
        '',
        'Pass `?city=dhaka` or `?city=chattogram` to filter server-side.',
      ].join('\n'),
      operationId: 'streamTraffic',
      parameters: queryParameters(
        // `city` is the only stream parameter; reuse the list schema would add
        // unrelated filters to the docs.
        listTrafficQuerySchema.pick({ city: true }),
      ),
      responses: {
        200: {
          description: 'SSE stream (`text/event-stream`)',
          content: {
            'text/event-stream': {
              schema: {
                type: 'string',
                description: 'UTF-8 SSE frames: `event:`, `data:` and optional `id:` lines.',
              },
            },
          },
        },
        422: errorResponse('Unknown query parameter or invalid city'),
      },
    },
  },

  [`${prefix}/events`]: {
    get: {
      tags: ['Traffic'],
      summary: 'Recent congestion events',
      description: [
        'Public. Returns the newest buffered observations (max 100) for clients that',
        'join the stream late. `meta` reports the buffer size, live SSE client count and',
        'whether the simulator is running.',
      ].join('\n'),
      operationId: 'listTrafficEvents',
      parameters: queryParameters(listTrafficQuerySchema),
      responses: {
        200: metaArrayEnvelope('TrafficEvent', 'TrafficMeta', 'Recent congestion events'),
        422: errorResponse('Unknown query parameter or invalid city/level'),
      },
    },
  },

  [`${prefix}/stats`]: {
    get: {
      tags: ['Traffic'],
      summary: 'Traffic stream and simulator statistics',
      description: 'Public. Live subscriber count, buffered events and simulator state.',
      operationId: 'trafficStats',
      responses: {
        200: successEnvelope('TrafficStats', 'Traffic statistics'),
      },
    },
  },

  [`${prefix}/simulate`]: {
    post: {
      tags: ['Traffic'],
      summary: 'Emit a congestion event (authenticated demo write)',
      description: [
        'Protected. Creates one synthetic observation, buffers it and publishes it to',
        'every SSE subscriber. Omitted `corridor` and `level` are chosen at random, so a',
        'demo can trigger a visible event with an empty body.',
      ].join('\n'),
      operationId: 'simulateTraffic',
      security: [{ bearerAuth: [] }],
      requestBody: jsonBody('SimulateTrafficInput', {
        city: 'dhaka',
        corridor: 'Banani → Dhanmondi',
        level: 'heavy',
      }),
      responses: {
        201: successEnvelope('TrafficEvent', 'Congestion event emitted'),
        401: errorResponse('Missing or invalid token'),
        422: errorResponse('Unknown key, invalid city or congestion level'),
      },
    },
  },
} as const;

import { env } from '../../config/env.js';
import { MAX_BEARING_DELTA_DEGREES } from '../../modules/matching/matching.scoring.js';
import { errorResponse, jsonBody, metaEnvelope } from '../registry.js';

const prefix = `${env.API_PREFIX}/matches`;

export const matchingPaths = {
  [`${prefix}/search`]: {
    post: {
      tags: ['Matching'],
      summary: 'Find and rank commute matches',
      description: [
        'Protected endpoint. Finds published rides whose **pickup** is within `pickupRadiusMeters` of `origin`',
        'and whose **dropoff** is within `dropoffRadiusMeters` of `destination` (`$geoNear` + `$geoWithin`).',
        '',
        'Hard filters: `status: published`, `seatsAvailable >= seats`, `departureAt` inside',
        '`[departureAt - flexMinutes, departureAt + flexMinutes]`, and the requester\'s own rides are excluded.',
        `Rides heading more than ${MAX_BEARING_DELTA_DEGREES}° away from the commuter's direction are rejected.`,
        '',
        'Results are ranked by a transparent 0-100 score: pickup 30, dropoff 25, time fit 20,',
        'bearing alignment 15, and seat availability 10. Each component returns its `points`, `max`',
        'and the measurement behind it (metres, minutes, degrees), so ranking is auditable.',
        '',
        '`meta` reports how many candidates Mongo returned, how many were rejected for bearing, and how many were returned.',
      ].join('\n'),
      operationId: 'searchMatches',
      security: [{ bearerAuth: [] }],
      requestBody: jsonBody('MatchSearchInput', {
        origin: { type: 'Point', coordinates: [90.4043, 23.7937] },
        destination: { type: 'Point', coordinates: [90.3742, 23.7461] },
        departureAt: '2026-11-07T08:15:00.000Z',
        flexMinutes: 30,
        seats: 1,
        pickupRadiusMeters: 2000,
        dropoffRadiusMeters: 1500,
        limit: 20,
      }),
      responses: {
        200: metaEnvelope(
          'MatchSearchResult',
          'MatchSearchMeta',
          'Ranked matches with a per-factor score breakdown',
        ),
        401: errorResponse('Missing or invalid token'),
        422: errorResponse('Validation failed (coordinates, departure window, radii, unknown keys)'),
        429: errorResponse('Rate limit exceeded'),
      },
    },
  },
} as const;

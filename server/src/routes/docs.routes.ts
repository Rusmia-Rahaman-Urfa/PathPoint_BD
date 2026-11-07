import { Router } from 'express';
import { apiReference } from '@scalar/express-api-reference';
import { openApiDocument } from '../openapi/document.js';

export const docsRouter = Router();

/**
 * Machine-readable contract. Generated from the same Zod schemas that
 * validate requests, so it can never silently drift from runtime behaviour.
 */
docsRouter.get('/openapi.json', (_req, res) => {
  res.json(openApiDocument);
});

/** Interactive Scalar reference with an "Authorize" box and try-it-out. */
docsRouter.use(
  '/docs',
  apiReference({
    url: '/openapi.json',
    pageTitle: 'PathPoint_BD API Reference',
    theme: 'kepler',
  }),
);

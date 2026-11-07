import type { Request, RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../lib/ApiError.js';
import { formatZodIssues } from '../lib/validation.js';

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

type Source = keyof ValidationSchemas;

/**
 * Express 5 exposes `req.query` as a prototype getter, so a plain assignment
 * would throw in strict mode. Defining an own property is the supported way to
 * replace it with the parsed, coerced and stripped value.
 */
function replace(req: Request, source: Source, value: unknown): void {
  Object.defineProperty(req, source, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * One middleware for every input surface. Because `z.strictObject` is used for
 * bodies, unknown keys are rejected rather than silently forwarded to Mongo.
 */
export const validate = (schemas: ValidationSchemas): RequestHandler => {
  return (req, _res, next) => {
    try {
      for (const source of ['params', 'query', 'body'] as const) {
        const schema = schemas[source];
        if (!schema) continue;

        const result = schema.safeParse(req[source]);
        if (!result.success) {
          throw ApiError.validation('Request validation failed', formatZodIssues(result.error));
        }
        replace(req, source, result.data);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

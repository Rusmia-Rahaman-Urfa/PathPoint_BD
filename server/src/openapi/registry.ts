import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;

/**
 * Zod is the single source of truth for the API contract. Zod 4 can emit
 * JSON Schema natively, so the OpenAPI document is generated from the very
 * schemas that validate requests - docs cannot drift from behaviour.
 */
export function toJsonSchema(schema: z.ZodType, io: 'input' | 'output' = 'input'): JsonSchema {
  // The document is OpenAPI 3.1, whose schemas are JSON Schema 2020-12. Zod's
  // dedicated `openapi-3.1` target still emits legacy tuple `items: [...]`,
  // which is invalid in 2020-12, so emit 2020-12 and strip the dialect marker.
  const json = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
  }) as JsonSchema;

  const { $schema: _schemaDialect, ...rest } = json;
  return rest;
}

export const schemaRef = (name: string): JsonSchema => ({
  $ref: `#/components/schemas/${name}`,
});

export const successEnvelope = (schemaName: string, description: string) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['success', 'data', 'timestamp'],
        properties: {
          success: { type: 'boolean', const: true },
          data: schemaRef(schemaName),
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
});

/** Same envelope, but `data` is an array and `meta` carries pagination. */
export const paginatedEnvelope = (schemaName: string, description: string) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta', 'timestamp'],
        properties: {
          success: { type: 'boolean', const: true },
          data: { type: 'array', items: schemaRef(schemaName) },
          meta: schemaRef('PaginationMeta'),
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
});

/** Success envelope whose `meta` is a named component instead of pagination. */
export const metaEnvelope = (
  schemaName: string,
  metaSchemaName: string,
  description: string,
) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta', 'timestamp'],
        properties: {
          success: { type: 'boolean', const: true },
          data: schemaRef(schemaName),
          meta: schemaRef(metaSchemaName),
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
});

export const errorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: schemaRef('ErrorResponse'),
    },
  },
});

export const jsonBody = (schemaName: string, example?: Record<string, unknown>) => ({
  required: true,
  content: {
    'application/json': {
      schema: schemaRef(schemaName),
      ...(example ? { example } : {}),
    },
  },
});

/**
 * Turns a Zod object schema into OpenAPI `parameters` entries. Generated, not
 * hand-written, so a new query parameter automatically shows up in /docs.
 */
export function queryParameters(schema: z.ZodType): Array<Record<string, unknown>> {
  const json = toJsonSchema(schema, 'input');
  const properties = (json.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set((json.required as string[] | undefined) ?? []);

  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: propertySchema,
  }));
}

export const pathIdParameter = (pattern = '^[a-f0-9]{24}$'): Record<string, unknown> => ({
  name: 'id',
  in: 'path',
  required: true,
  description: 'MongoDB ObjectId',
  schema: { type: 'string', pattern },
});

/** Named path parameter for nested resources (`rideId`, `id`, ...). */
export const objectIdParameter = (
  name: string,
  description = 'MongoDB ObjectId',
): Record<string, unknown> => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', pattern: '^[a-f0-9]{24}$' },
});

/** Success envelope whose `data` is an array and `meta` is a named component. */
export const metaArrayEnvelope = (
  schemaName: string,
  metaSchemaName: string,
  description: string,
) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta', 'timestamp'],
        properties: {
          success: { type: 'boolean', const: true },
          data: { type: 'array', items: schemaRef(schemaName) },
          meta: schemaRef(metaSchemaName),
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
});

export const PAGINATION_META_SCHEMA = {
  type: 'object',
  required: ['page', 'limit', 'total', 'totalPages', 'hasNextPage', 'hasPreviousPage'],
  properties: {
    page: { type: 'integer', minimum: 1 },
    limit: { type: 'integer', minimum: 1 },
    total: { type: 'integer', minimum: 0 },
    totalPages: { type: 'integer', minimum: 0 },
    hasNextPage: { type: 'boolean' },
    hasPreviousPage: { type: 'boolean' },
  },
};

import type { ZodError } from 'zod';
import type { ErrorDetail } from './ApiError.js';

/**
 * Converts Zod issues into the stable `{ path, message }` shape used by the API.
 * `unrecognized_keys` is expanded per key so clients get an actionable path
 * (`isAdmin`) instead of a vague `(root)` entry.
 */
export function formatZodIssues(error: ZodError): ErrorDetail[] {
  return error.issues.flatMap((issue) => {
    const basePath = issue.path.map((segment) => String(segment)).join('.');

    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: basePath ? `${basePath}.${key}` : key,
        message: `Unrecognized key: "${key}"`,
      }));
    }

    return [
      {
        path: basePath || '(root)',
        message: issue.message,
      },
    ];
  });
}

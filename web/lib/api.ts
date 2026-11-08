import type { ApiEnvelope } from './types';

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
).replace(/\/$/, '');

const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 750;

/** Shown when the Render free instance is waking up or the gateway times out. */
export const BACKEND_SPIN_UP_MESSAGE =
  'Backend is spinning up (free instance). Please wait 20 seconds and click Sign In again.';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: Array<{ path: string; message: string }>;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isGatewayStatus = (status: number): boolean =>
  status === 502 || status === 503 || status === 504;

const spinUpError = (): ApiError =>
  new ApiError(BACKEND_SPIN_UP_MESSAGE, 504, 'BACKEND_UNAVAILABLE');

/**
 * Fetch wrapper with a 15s timeout and one retry. Render's free tier can take
 * tens of seconds to wake up, so a single slow/gateway response is retried once
 * before surfacing the friendly "backend is spinning up" message.
 */
async function apiFetch(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const external = init.signal;
    const abortFromExternal = (): void => controller.abort();

    if (external) {
      if (external.aborted) {
        controller.abort();
      } else {
        external.addEventListener('abort', abortFromExternal, { once: true });
      }
    }

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      if (isGatewayStatus(response.status)) {
        lastError = spinUpError();
        if (attempt === 0) {
          await delay(RETRY_DELAY_MS);
          continue;
        }
        throw lastError;
      }

      return response;
    } catch (cause) {
      if (cause instanceof ApiError) {
        lastError = cause;
      } else {
        const timedOut = controller.signal.aborted && !(external?.aborted ?? false);
        const networkFailure = cause instanceof TypeError;
        lastError = timedOut || networkFailure ? spinUpError() : cause;
      }

      const shouldRetry = lastError instanceof ApiError && lastError.code === 'BACKEND_UNAVAILABLE';
      if (shouldRetry && attempt === 0) {
        await delay(RETRY_DELAY_MS);
        continue;
      }

      throw lastError;
    } finally {
      clearTimeout(timeout);
      external?.removeEventListener('abort', abortFromExternal);
    }
  }

  throw lastError instanceof Error ? lastError : spinUpError();
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const response = await apiFetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    cache: 'no-store',
    signal: options.signal,
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (isGatewayStatus(response.status)) {
      throw spinUpError();
    }

    const error = (payload as { error?: { message?: string; code?: string; details?: [] } })
      ?.error;
    throw new ApiError(
      error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error?.code,
      error?.details,
    );
  }

  if (payload === null) {
    // 204 No Content (e.g. DELETE /rides/:id).
    return {
      success: true,
      data: undefined as T,
      timestamp: new Date().toISOString(),
    };
  }

  return payload as ApiEnvelope<T>;
}

/** Convenience wrapper that returns only the `data` payload. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const envelope = await request<T>(path, options);
  return envelope.data;
}

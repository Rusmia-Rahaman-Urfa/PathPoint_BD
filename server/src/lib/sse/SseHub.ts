import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

export interface SseEvent {
  /** SSE `event:` name. Omit for a default `message` event. */
  event?: string;
  /** Serialised with `JSON.stringify`. */
  data: unknown;
  /** Optional SSE `id:`. Defaults to a fresh UUID per publish. */
  id?: string;
}

export interface SseSubscribeOptions {
  /** Reconnection delay advertised to the client. */
  retryMs?: number;
  /** Per-client filter, e.g. only events for one city. */
  filter?: (event: SseEvent) => boolean;
  /** Invoked exactly once when the connection closes. */
  onClose?: () => void;
}

interface SseClient {
  id: string;
  res: Response;
  connectedAt: number;
  heartbeat: NodeJS.Timeout;
  filter?: (event: SseEvent) => boolean;
  cleanup: () => void;
}

/**
 * Minimal in-process pub/sub for Server-Sent Events.
 *
 * Deliberately transport-only: it knows nothing about traffic, rides or auth,
 * so any module can publish domain events without importing Express. A single
 * hub instance is shared by the app (`traffic.sse.ts`), which keeps fan-out
 * O(clients) and avoids a Redis dependency for a single-instance deployment.
 */
export class SseHub {
  private readonly clients = new Map<string, SseClient>();
  private readonly heartbeatMs: number;

  constructor(options: { heartbeatMs?: number } = {}) {
    this.heartbeatMs = options.heartbeatMs ?? 15_000;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Attaches an SSE response and keeps it open. Returns the client id so the
   * caller can log it. Headers are flushed immediately so proxies and clients
   * see the stream before the first domain event.
   */
  subscribe(req: Request, res: Response, options: SseSubscribeOptions = {}): string {
    const clientId = randomUUID();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Render/nginx: do not buffer the stream.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    res.write(`retry: ${options.retryMs ?? 3_000}\n\n`);
    this.write(res, {
      event: 'connected',
      data: {
        clientId,
        connectedAt: new Date().toISOString(),
        heartbeatMs: this.heartbeatMs,
      },
    });

    const heartbeat = setInterval(() => {
      if (res.writableEnded) return;
      // Comment frame: ignored by EventSource but keeps intermediaries awake.
      res.write(': ping\n\n');
    }, this.heartbeatMs);
    heartbeat.unref?.();

    let closed = false;
    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      this.clients.delete(clientId);
      options.onClose?.();
    };

    this.clients.set(clientId, {
      id: clientId,
      res,
      connectedAt: Date.now(),
      heartbeat,
      ...(options.filter ? { filter: options.filter } : {}),
      cleanup,
    });

    // `req` close fires on client disconnect; `res` close covers server-side
    // termination. cleanup is idempotent so both can fire safely.
    req.on('close', cleanup);
    res.on('close', cleanup);

    return clientId;
  }

  publish(event: SseEvent): number {
    let delivered = 0;

    for (const client of this.clients.values()) {
      if (client.res.writableEnded) {
        client.cleanup();
        continue;
      }
      if (client.filter && !client.filter(event)) continue;

      this.write(client.res, event);
      delivered += 1;
    }

    return delivered;
  }

  /** Graceful shutdown: tell clients why the stream ended, then close. */
  closeAll(reason = 'server shutting down'): void {
    for (const client of this.clients.values()) {
      if (!client.res.writableEnded) {
        this.write(client.res, {
          event: 'shutdown',
          data: { reason, at: new Date().toISOString() },
        });
        client.res.end();
      }
      client.cleanup();
    }
    this.clients.clear();
  }

  private write(res: Response, event: SseEvent): void {
    if (res.writableEnded) return;

    const lines: string[] = [];
    if (event.id) lines.push(`id: ${event.id}`);
    if (event.event) lines.push(`event: ${event.event}`);
    lines.push(`data: ${JSON.stringify(event.data)}`);

    res.write(`${lines.join('\n')}\n\n`);
  }
}

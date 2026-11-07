'use client';

import { useEffect, useState } from 'react';
import { API_URL } from './api';
import type { TrafficEvent } from './types';

export type StreamStatus = 'connecting' | 'live' | 'error';

const MAX_EVENTS = 40;

/**
 * Live congestion feed.
 *
 * Reads are public by design (EventSource cannot attach an Authorization
 * header), so the stream works with no session. The recent buffer is fetched
 * once first, then new `traffic` frames are prepended. EventSource reconnects
 * on its own after a proxy timeout.
 */
export function useTrafficStream(enabled = true) {
  const [events, setEvents] = useState<TrafficEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>('connecting');

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let source: EventSource | undefined;

    const loadRecent = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_URL}/api/v1/traffic/events?limit=20`, {
          cache: 'no-store',
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as { data?: TrafficEvent[] };
        if (!cancelled && Array.isArray(payload.data)) {
          setEvents((current) => {
            // Keep anything that arrived over SSE while the fetch was in flight.
            const seen = new Set(current.map((event) => event.id));
            const merged = [...current, ...payload.data!.filter((event) => !seen.has(event.id))];
            return merged.slice(0, MAX_EVENTS);
          });
        }
      } catch {
        // The stream below is the source of truth; a failed buffer read is fine.
      }
    };

    void loadRecent();

    source = new EventSource(`${API_URL}/api/v1/traffic/stream`);

    source.addEventListener('connected', () => setStatus('live'));

    source.addEventListener('traffic', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as TrafficEvent;
        setStatus('live');
        setEvents((current) => [data, ...current.filter((item) => item.id !== data.id)].slice(0, MAX_EVENTS));
      } catch {
        // Ignore malformed frames rather than killing the feed.
      }
    });

    source.onerror = () => setStatus('error');

    return () => {
      cancelled = true;
      source?.close();
    };
  }, [enabled]);

  return { events, status };
}

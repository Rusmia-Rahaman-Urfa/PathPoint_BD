import { randomUUID } from 'node:crypto';
import { CONGESTION_LEVELS, type CongestionLevel } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { trafficHub } from './traffic.sse.js';
import {
  TRAFFIC_CITIES,
  type ListTrafficQuery,
  type SimulateTrafficInput,
  type TrafficCity,
  type TrafficEvent,
  type TrafficStats,
} from './traffic.schemas.js';

const MAX_BUFFERED_EVENTS = 100;

const CORRIDORS: Record<TrafficCity, string[]> = {
  dhaka: [
    'Uttara → Banani',
    'Banani → Dhanmondi',
    'Gulshan → Motijheel',
    'Mirpur → Farmgate',
    'Airport → Gulshan',
  ],
  chattogram: [
    'GEC → Agrabad',
    'Nasirabad → Oxygen',
    'Pahartali → Khulshi',
    'Agrabad → GEC',
  ],
};

interface LevelProfile {
  speed: readonly [number, number];
  delay: readonly [number, number];
  weight: number;
}

const PROFILES: Record<CongestionLevel, LevelProfile> = {
  free: { speed: [40, 65], delay: [0, 4], weight: 0.28 },
  moderate: { speed: [22, 40], delay: [5, 14], weight: 0.4 },
  heavy: { speed: [10, 22], delay: [15, 35], weight: 0.24 },
  severe: { speed: [4, 10], delay: [35, 75], weight: 0.08 },
};

const round = (value: number, decimals = 1): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const randomBetween = ([min, max]: readonly [number, number]): number =>
  min + Math.random() * (max - min);

const pick = <T>(values: readonly T[]): T => values[Math.floor(Math.random() * values.length)]!;

function randomLevel(): CongestionLevel {
  const roll = Math.random();
  let cumulative = 0;

  for (const level of CONGESTION_LEVELS) {
    cumulative += PROFILES[level].weight;
    if (roll <= cumulative) return level;
  }

  return 'moderate';
}

let timer: NodeJS.Timeout | undefined;
let intervalMs = env.TRAFFIC_SIM_INTERVAL_MS;

/** Newest first; bounded so a long-running demo cannot grow without limit. */
const buffer: TrafficEvent[] = [];

function buildEvent(
  city: TrafficCity,
  corridor: string,
  level: CongestionLevel,
  source: TrafficEvent['source'],
): TrafficEvent {
  const profile = PROFILES[level];

  return {
    id: randomUUID(),
    city,
    corridor,
    level,
    speedKph: round(randomBetween(profile.speed)),
    delayMinutes: Math.round(randomBetween(profile.delay)),
    observedAt: new Date().toISOString(),
    source,
  };
}

function record(event: TrafficEvent): TrafficEvent {
  buffer.unshift(event);
  if (buffer.length > MAX_BUFFERED_EVENTS) buffer.length = MAX_BUFFERED_EVENTS;

  trafficHub.publish({ event: 'traffic', data: event, id: event.id });
  return event;
}

export const trafficService = {
  /** Public read model, newest first. */
  list(query: ListTrafficQuery): TrafficEvent[] {
    return buffer
      .filter((event) => (query.city ? event.city === query.city : true))
      .filter((event) => (query.level ? event.level === query.level : true))
      .slice(0, query.limit);
  },

  /** Authenticated write: emit one synthetic observation on demand. */
  simulate(input: SimulateTrafficInput): TrafficEvent {
    const city = input.city;
    const corridor = input.corridor ?? pick(CORRIDORS[city]);
    const level = input.level ?? randomLevel();

    return record(buildEvent(city, corridor, level, 'manual'));
  },

  /** One simulator tick: random city, corridor and level. */
  tick(): TrafficEvent {
    const city = pick(TRAFFIC_CITIES);
    return record(buildEvent(city, pick(CORRIDORS[city]), randomLevel(), 'simulator'));
  },

  start(ms = env.TRAFFIC_SIM_INTERVAL_MS): void {
    if (timer) return;

    intervalMs = ms;
    // Emit immediately so a freshly opened dashboard is not empty.
    trafficService.tick();

    timer = setInterval(() => trafficService.tick(), ms);
    timer.unref?.();
  },

  stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = undefined;
  },

  get isRunning(): boolean {
    return timer !== undefined;
  },

  get interval(): number {
    return intervalMs;
  },

  stats(): TrafficStats {
    return {
      clients: trafficHub.clientCount,
      bufferedEvents: buffer.length,
      simulatorRunning: trafficService.isRunning,
      intervalMs,
      cities: [...TRAFFIC_CITIES],
      levels: [...CONGESTION_LEVELS],
    };
  },

  /** Test/ops helper: drop buffered events without touching subscribers. */
  clear(): void {
    buffer.length = 0;
  },
};

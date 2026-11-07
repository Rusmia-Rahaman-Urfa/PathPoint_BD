import { z } from 'zod';
import { CONGESTION_LEVELS } from '../../config/constants.js';

export const TRAFFIC_CITIES = ['dhaka', 'chattogram'] as const;
export type TrafficCity = (typeof TRAFFIC_CITIES)[number];

export const simulateTrafficSchema = z.strictObject({
  city: z.enum(TRAFFIC_CITIES).default('dhaka'),
  corridor: z.string().min(2).max(80).optional(),
  level: z.enum(CONGESTION_LEVELS).optional(),
});

export const listTrafficQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  city: z.enum(TRAFFIC_CITIES).optional(),
  level: z.enum(CONGESTION_LEVELS).optional(),
});

export const trafficStreamQuerySchema = z.strictObject({
  city: z.enum(TRAFFIC_CITIES).optional(),
});

/** Public contract for a single congestion observation. */
export const trafficEventSchema = z.object({
  id: z.string(),
  city: z.enum(TRAFFIC_CITIES),
  corridor: z.string(),
  level: z.enum(CONGESTION_LEVELS),
  speedKph: z.number(),
  delayMinutes: z.number(),
  observedAt: z.string(),
  source: z.enum(['simulator', 'manual']),
});

export const trafficMetaSchema = z.object({
  total: z.number().int().min(0),
  clients: z.number().int().min(0),
  simulatorRunning: z.boolean(),
  intervalMs: z.number().int().min(0),
});

export const trafficStatsSchema = z.object({
  clients: z.number().int().min(0),
  bufferedEvents: z.number().int().min(0),
  simulatorRunning: z.boolean(),
  intervalMs: z.number().int().min(0),
  cities: z.array(z.enum(TRAFFIC_CITIES)),
  levels: z.array(z.enum(CONGESTION_LEVELS)),
});

export type SimulateTrafficInput = z.infer<typeof simulateTrafficSchema>;
export type ListTrafficQuery = z.infer<typeof listTrafficQuerySchema>;
export type TrafficStreamQuery = z.infer<typeof trafficStreamQuerySchema>;
export type TrafficEvent = z.infer<typeof trafficEventSchema>;
export type TrafficMeta = z.infer<typeof trafficMetaSchema>;
export type TrafficStats = z.infer<typeof trafficStatsSchema>;

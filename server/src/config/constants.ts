/**
 * Domain constants shared across modules.
 * Keep enums + regexes here so Zod schemas, Mongoose models and OpenAPI
 * all describe the exact same vocabulary.
 */

export const API_VERSION = '0.1.0';

export const USER_ROLES = ['rider', 'driver', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CONGESTION_LEVELS = ['free', 'moderate', 'heavy', 'severe'] as const;
export type CongestionLevel = (typeof CONGESTION_LEVELS)[number];

export const RIDE_STATUSES = ['draft', 'published', 'full', 'cancelled', 'completed'] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const RIDE_REQUEST_STATUSES = ['open', 'matched', 'cancelled', 'expired'] as const;
export type RideRequestStatus = (typeof RIDE_REQUEST_STATUSES)[number];

/** Bangladesh mobile numbers, E.164 form: +8801[3-9]XXXXXXXX */
export const BD_PHONE_REGEX = /^\+8801[3-9]\d{8}$/;

/** Loose bounding box around Bangladesh - rejects garbage coordinates early. */
export const BD_BOUNDS = {
  minLng: 88.0,
  maxLng: 92.7,
  minLat: 20.5,
  maxLat: 26.7,
} as const;

export const CITY_CENTERS = {
  dhaka: { lng: 90.4125, lat: 23.8103 },
  chattogram: { lng: 91.8317, lat: 22.3569 },
} as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const BCRYPT_MAX_PASSWORD_BYTES = 72;

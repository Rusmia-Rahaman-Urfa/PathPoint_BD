import type { CongestionLevel, GeoPoint } from './types';

export interface Place {
  id: string;
  label: string;
  short: string;
  city: 'dhaka' | 'chattogram';
  lng: number;
  lat: number;
}

export const PLACES: Place[] = [
  { id: 'banani', label: 'Banani, Dhaka', short: 'Banani', city: 'dhaka', lng: 90.4043, lat: 23.7937 },
  { id: 'gulshan1', label: 'Gulshan 1 Circle, Dhaka', short: 'Gulshan 1', city: 'dhaka', lng: 90.4156, lat: 23.7806 },
  { id: 'gulshan2', label: 'Gulshan 2, Dhaka', short: 'Gulshan 2', city: 'dhaka', lng: 90.4078, lat: 23.7925 },
  { id: 'dhanmondi27', label: 'Dhanmondi 27, Dhaka', short: 'Dhanmondi 27', city: 'dhaka', lng: 90.3742, lat: 23.7461 },
  { id: 'dhanmondi32', label: 'Dhanmondi 32, Dhaka', short: 'Dhanmondi 32', city: 'dhaka', lng: 90.376, lat: 23.7509 },
  { id: 'uttara7', label: 'Uttara Sector 7, Dhaka', short: 'Uttara 7', city: 'dhaka', lng: 90.3948, lat: 23.8687 },
  { id: 'uttara3', label: 'Uttara Sector 3, Dhaka', short: 'Uttara 3', city: 'dhaka', lng: 90.3902, lat: 23.8604 },
  { id: 'airport', label: 'Shahjalal Airport, Dhaka', short: 'Airport', city: 'dhaka', lng: 90.408, lat: 23.8516 },
  { id: 'motijheel', label: 'Motijheel, Dhaka', short: 'Motijheel', city: 'dhaka', lng: 90.417, lat: 23.733 },
  { id: 'mirpur', label: 'Mirpur 10, Dhaka', short: 'Mirpur 10', city: 'dhaka', lng: 90.3687, lat: 23.8069 },
  { id: 'gec', label: 'GEC Circle, Chattogram', short: 'GEC', city: 'chattogram', lng: 91.8317, lat: 22.3569 },
  { id: 'agrabad', label: 'Agrabad, Chattogram', short: 'Agrabad', city: 'chattogram', lng: 91.8082, lat: 22.3282 },
  { id: 'nasirabad', label: 'Nasirabad, Chattogram', short: 'Nasirabad', city: 'chattogram', lng: 91.8106, lat: 22.3686 },
  { id: 'oxygen', label: 'Oxygen Mor, Chattogram', short: 'Oxygen', city: 'chattogram', lng: 91.8264, lat: 22.3721 },
  { id: 'khulshi', label: 'Khulshi, Chattogram', short: 'Khulshi', city: 'chattogram', lng: 91.8082, lat: 22.3616 },
];

export const placeById = (id: string): Place => PLACES.find((place) => place.id === id) ?? PLACES[0]!;

export const toPoint = (place: Place): GeoPoint => ({
  type: 'Point',
  coordinates: [place.lng, place.lat],
});

/** `datetime-local` value in the browser's timezone, `hours` from now. */
export function localDateTime(hoursFromNow = 3): string {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function toIso(value: string): string {
  return new Date(value).toISOString();
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

export function relativeTime(value: string): string {
  const diffMs = Date.parse(value) - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return minutes >= 0 ? `in ${minutes} min` : `${-minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return hours >= 0 ? `in ${hours} h` : `${-hours} h ago`;
  return formatDateTime(value);
}

export function formatBdt(value: number): string {
  return `৳${new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(value)}`;
}

export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export const congestionTone: Record<CongestionLevel, string> = {
  free: 'tone-free',
  moderate: 'tone-moderate',
  heavy: 'tone-heavy',
  severe: 'tone-severe',
};

export const statusTone: Record<string, string> = {
  published: 'tone-free',
  open: 'tone-free',
  confirmed: 'tone-free',
  pending: 'tone-moderate',
  full: 'tone-heavy',
  matched: 'tone-heavy',
  cancelled: 'tone-severe',
  expired: 'tone-severe',
  completed: 'tone-neutral',
  draft: 'tone-neutral',
};

export function scoreTone(score: number): string {
  if (score >= 80) return 'tone-free';
  if (score >= 60) return 'tone-moderate';
  return 'tone-heavy';
}

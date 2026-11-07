export type Role = 'rider' | 'driver' | 'admin';

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  ratingAvg: number;
  ratingCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
}

export type RideStatus = 'draft' | 'published' | 'full' | 'cancelled' | 'completed';

export interface Ride {
  id: string;
  driverId: string;
  origin: GeoPoint;
  destination: GeoPoint;
  originAddress?: string;
  destinationAddress?: string;
  departureAt: string;
  seatsTotal: number;
  seatsAvailable: number;
  farePerSeat: number;
  vehicle?: { make: string; model: string; plate: string; ac: boolean };
  preferences: { genderPreference: 'any' | 'female' | 'male'; maxDetourMeters: number };
  status: RideStatus;
  distanceMeters?: number;
  cancelledAt?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface Booking {
  id: string;
  rideId: string;
  riderId: string;
  driverId: string;
  seats: number;
  farePerSeat: number;
  totalFare: number;
  rideDepartureAt: string;
  status: BookingStatus;
  rider?: { id: string; name: string; email: string; phone?: string };
  ride?: {
    id: string;
    origin: GeoPoint;
    destination: GeoPoint;
    originAddress?: string;
    destinationAddress?: string;
    departureAt: string;
    status: RideStatus;
    farePerSeat: number;
    seatsTotal: number;
    seatsAvailable: number;
  };
  confirmedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type RequestStatus = 'open' | 'matched' | 'cancelled' | 'expired';

export interface RideRequest {
  id: string;
  riderId: string;
  origin: GeoPoint;
  destination: GeoPoint;
  originAddress?: string;
  destinationAddress?: string;
  departureAt: string;
  flexMinutes: number;
  seats: number;
  maxFarePerSeat?: number;
  notes?: string;
  status: RequestStatus;
  matchedRideId?: string;
  distanceMeters?: number;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchBreakdown {
  pickup: { points: number; max: number; distanceMeters: number; radiusMeters: number };
  dropoff: { points: number; max: number; distanceMeters: number; radiusMeters: number };
  time: { points: number; max: number; deltaMinutes: number; flexMinutes: number };
  bearing: { points: number; max: number; deltaDegrees: number; maxDeltaDegrees: number };
  availability: {
    points: number;
    max: number;
    seatsAvailable: number;
    seatsTotal: number;
    seatsRequested: number;
  };
}

export interface MatchCard {
  ride: Ride;
  score: number;
  breakdown: MatchBreakdown;
}

export interface MatchSearchResult {
  query: {
    origin: GeoPoint;
    destination: GeoPoint;
    departureAt: string;
    windowStart: string;
    windowEnd: string;
    flexMinutes: number;
    seats: number;
    pickupRadiusMeters: number;
    dropoffRadiusMeters: number;
  };
  matches: MatchCard[];
}

export type CongestionLevel = 'free' | 'moderate' | 'heavy' | 'severe';

export interface TrafficEvent {
  id: string;
  city: 'dhaka' | 'chattogram';
  corridor: string;
  level: CongestionLevel;
  speedKph: number;
  delayMinutes: number;
  observedAt: string;
  source: 'simulator' | 'manual';
}

export interface TrafficStats {
  clients: number;
  bufferedEvents: number;
  simulatorRunning: boolean;
  intervalMs: number;
  cities: Array<'dhaka' | 'chattogram'>;
  levels: CongestionLevel[];
}

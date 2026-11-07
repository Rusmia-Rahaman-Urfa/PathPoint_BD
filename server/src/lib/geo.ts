import { Schema } from 'mongoose';
import { BD_BOUNDS } from '../config/constants.js';

/** GeoJSON Point as stored in MongoDB (always [longitude, latitude]). */
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export const isValidLngLat = (lng: number, lat: number): boolean =>
  Number.isFinite(lng) &&
  Number.isFinite(lat) &&
  lng >= BD_BOUNDS.minLng &&
  lng <= BD_BOUNDS.maxLng &&
  lat >= BD_BOUNDS.minLat &&
  lat <= BD_BOUNDS.maxLat;

export const toGeoPoint = (lng: number, lat: number): GeoPoint => ({
  type: 'Point',
  coordinates: [lng, lat],
});

/**
 * MongoDB's spherical calculations (`$geoNear`, `$centerSphere`) use this
 * radius, so the application-side haversine uses it too. Mixing radii would
 * make a ride sit inside the `$geoWithin` filter yet report a slightly larger
 * distance during scoring.
 */
export const EARTH_RADIUS_METERS = 6_378_100;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Great-circle distance in metres between two GeoJSON points. */
export function haversineMeters(from: GeoPoint, to: GeoPoint): number {
  const [lng1, lat1] = from.coordinates;
  const [lng2, lat2] = to.coordinates;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(clamp(Math.sqrt(a), 0, 1));
}

/**
 * Forward azimuth from `from` to `to`, in degrees clockwise from true north.
 * This is the "corridor direction" used to reject rides heading the wrong way.
 */
export function initialBearingDegrees(from: GeoPoint, to: GeoPoint): number {
  const [lng1, lat1] = from.coordinates;
  const [lng2, lat2] = to.coordinates;

  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const dLng = toRadians(lng2 - lng1);

  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest absolute difference between two bearings, always 0-180 degrees. */
export function bearingDeltaDegrees(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360 + 360) % 360);
  return diff > 180 ? 360 - diff : diff;
}


/**
 * Reusable Mongoose sub-schema for every geo field in the project.
 * Validating at the model layer means no malformed document can poison the
 * 2dsphere index even if a service forgets to validate.
 */
export const pointSchema = new Schema<GeoPoint>(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value: unknown): boolean =>
          Array.isArray(value) &&
          value.length === 2 &&
          typeof value[0] === 'number' &&
          typeof value[1] === 'number' &&
          isValidLngLat(value[0], value[1]),
        message: 'coordinates must be [lng, lat] inside Bangladesh bounds',
      },
    },
  },
  { _id: false },
);

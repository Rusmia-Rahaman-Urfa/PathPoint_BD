import type { GeoPoint } from '@/lib/types';

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  code?: string;
}

export interface MapRoute {
  id: string;
  origin: MapPoint;
  destination: MapPoint;
  active?: boolean;
}

export interface TransitMapProps {
  center?: [number, number];
  zoom?: number;
  origin?: MapPoint | null;
  destination?: MapPoint | null;
  routes?: MapRoute[];
  className?: string;
  ariaLabel?: string;
}

export const CITY_CENTERS = {
  dhaka: { lat: 23.8103, lng: 90.4125, zoom: 12 },
  chattogram: { lat: 22.3569, lng: 91.7832, zoom: 12 },
} as const;

export const DHAKA_CENTER: [number, number] = [CITY_CENTERS.dhaka.lat, CITY_CENTERS.dhaka.lng];

/** Mongo/GeoJSON stores coordinates as [lng, lat]; Leaflet wants [lat, lng]. */
export const geoToMapPoint = (point: GeoPoint, label?: string, code?: string): MapPoint => ({
  lng: point.coordinates[0],
  lat: point.coordinates[1],
  label,
  code,
});

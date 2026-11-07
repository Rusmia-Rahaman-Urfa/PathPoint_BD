'use client';

import dynamic from 'next/dynamic';
import type { TransitMapProps } from './types';

const TransitMapCanvas = dynamic(() => import('./TransitMapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="map-loading" aria-hidden>
      <span className="spinner" />
      <span>Loading OpenStreetMap…</span>
    </div>
  ),
});

export function TransitMap({ className, ariaLabel, ...props }: TransitMapProps) {
  return (
    <div
      className={`map-canvas${className ? ` ${className}` : ''}`}
      role="region"
      aria-label={ariaLabel ?? 'Interactive route map'}
    >
      <TransitMapCanvas {...props} />
    </div>
  );
}

export type { MapPoint, MapRoute, TransitMapProps } from './types';
export { CITY_CENTERS, DHAKA_CENTER, geoToMapPoint } from './types';

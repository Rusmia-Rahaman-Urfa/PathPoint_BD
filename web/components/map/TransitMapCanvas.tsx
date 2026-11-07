'use client';

import { useEffect, useMemo } from 'react';
import { divIcon, latLngBounds, type LatLngExpression } from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { CITY_CENTERS, DHAKA_CENTER, type MapPoint, type MapRoute, type TransitMapProps } from './types';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const pinIcon = (kind: 'origin' | 'destination') =>
  divIcon({
    className: 'pp-pin-wrap',
    html: `<span class="pp-pin pp-pin-${kind}"><span class="pp-pin-core"></span></span>`,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -30],
  });

const ORIGIN_ICON = pinIcon('origin');
const DESTINATION_ICON = pinIcon('destination');

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const key = points.map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join('|');

  useEffect(() => {
    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13);
      return;
    }

    map.fitBounds(
      latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number])),
      { padding: [44, 44], maxZoom: 14 },
    );
    // `key` captures the coordinate identity; the array itself is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  return null;
}

function StopPopup({ kind, point }: { kind: string; point: MapPoint }) {
  return (
    <div className="pp-popup">
      <span className="pp-popup-kicker">{kind}</span>
      <strong>{point.label ?? 'Unnamed stop'}</strong>
      {point.code ? <span className="pp-popup-code">{point.code}</span> : null}
    </div>
  );
}

function RouteLine({ route }: { route: MapRoute }) {
  const positions: LatLngExpression[] = [
    [route.origin.lat, route.origin.lng],
    [route.destination.lat, route.destination.lng],
  ];

  return (
    <>
      {route.active ? (
        <Polyline
          positions={positions}
          interactive={false}
          pathOptions={{ color: '#14B8A6', weight: 11, opacity: 0.12, lineCap: 'round' }}
        />
      ) : null}
      <Polyline
        positions={positions}
        pathOptions={{
          color: route.active ? '#2DD4BF' : '#38BDF8',
          weight: route.active ? 4 : 2.5,
          opacity: route.active ? 0.95 : 0.42,
          dashArray: route.active ? undefined : '6 9',
          lineCap: 'round',
        }}
      />
    </>
  );
}

export default function TransitMapCanvas({
  center,
  zoom,
  origin,
  destination,
  routes = [],
}: TransitMapProps) {
  const mapCenter: [number, number] = center ?? DHAKA_CENTER;
  const mapZoom = zoom ?? CITY_CENTERS.dhaka.zoom;

  const fitPoints = useMemo(() => {
    const points: MapPoint[] = [];
    if (origin) points.push(origin);
    if (destination) points.push(destination);
    for (const route of routes) {
      points.push(route.origin, route.destination);
    }
    return points;
  }, [origin, destination, routes]);

  const showRoutePins = !origin && !destination;

  return (
    <MapContainer
      center={mapCenter}
      zoom={mapZoom}
      scrollWheelZoom={false}
      className="pp-map"
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} subdomains="abcd" maxZoom={20} />
      <FitBounds points={fitPoints} />

      {routes.map((route) => (
        <RouteLine key={`line-${route.id}`} route={route} />
      ))}

      {origin ? (
        <Marker position={[origin.lat, origin.lng]} icon={ORIGIN_ICON}>
          <Popup>
            <StopPopup kind="Pickup" point={origin} />
          </Popup>
        </Marker>
      ) : null}

      {destination ? (
        <Marker position={[destination.lat, destination.lng]} icon={DESTINATION_ICON}>
          <Popup>
            <StopPopup kind="Dropoff" point={destination} />
          </Popup>
        </Marker>
      ) : null}

      {showRoutePins
        ? routes.map((route) => (
            <Marker
              key={`route-origin-${route.id}`}
              position={[route.origin.lat, route.origin.lng]}
              icon={ORIGIN_ICON}
            >
              <Popup>
                <StopPopup kind="Pickup" point={route.origin} />
              </Popup>
            </Marker>
          ))
        : null}

      {showRoutePins
        ? routes.map((route) => (
            <Marker
              key={`route-destination-${route.id}`}
              position={[route.destination.lat, route.destination.lng]}
              icon={DESTINATION_ICON}
            >
              <Popup>
                <StopPopup kind="Dropoff" point={route.destination} />
              </Popup>
            </Marker>
          ))
        : null}
    </MapContainer>
  );
}

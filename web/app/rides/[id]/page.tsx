'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TransitMap } from '@/components/map/TransitMap';
import { geoToMapPoint, type MapRoute } from '@/components/map/types';
import { Alert, Empty, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { formatBdt, formatDateTime, relativeTime } from '@/lib/format';
import { useSession } from '@/lib/useSession';
import type { Ride, RideRequest } from '@/lib/types';

const shortId = (id: string): string => id.slice(-6).toUpperCase();

export default function RideDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { session, loading: sessionLoading } = useSession();

  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [seats, setSeats] = useState('1');
  const [booking, setBooking] = useState(false);

  const [riders, setRiders] = useState<RideRequest[] | null>(null);
  const [matching, setMatching] = useState(false);

  const loadRide = useCallback(async (): Promise<void> => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const data = await api<Ride>(`/api/v1/rides/${id}`);
      setRide(data);
    } catch (cause) {
      setRide(null);
      setError(cause instanceof Error ? cause.message : 'Could not load this ride');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadRide();
  }, [loadRide]);

  if (sessionLoading || loading) {
    return (
      <div className="center">
        <Spinner label="Loading ride…" />
      </div>
    );
  }

  if (!ride) {
    return (
      <div className="grid" style={{ gap: 16 }}>
        <Alert tone="error">{error ?? 'Ride not found'}</Alert>
        <Link href="/search" className="btn btn-ghost">
          Back to search
        </Link>
      </div>
    );
  }

  const isOwner = session?.user.id === ride.driverId || session?.user.role === 'admin';
  const bookable =
    ride.status === 'published' && ride.seatsAvailable > 0 && !isOwner && Boolean(session);
  const maxSeats = Math.max(1, Math.min(8, ride.seatsAvailable));
  const mapOrigin = geoToMapPoint(ride.origin, ride.originAddress ?? 'Origin');
  const mapDestination = geoToMapPoint(ride.destination, ride.destinationAddress ?? 'Destination');
  const mapRoutes: MapRoute[] = [
    { id: ride.id, origin: mapOrigin, destination: mapDestination, active: true },
  ];

  const book = async (): Promise<void> => {
    if (!session) return;

    setBooking(true);
    setError(null);
    setNotice(null);

    try {
      const created = await api<{ id: string }>(`/api/v1/rides/${ride.id}/bookings`, {
        method: 'POST',
        token: session.token,
        body: { seats: Number(seats) },
      });
      setNotice(
        `Seat reserved — booking ${shortId(created.id)} is pending the driver's confirmation.`,
      );
      await loadRide();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Booking failed');
    } finally {
      setBooking(false);
    }
  };

  const loadRiders = async (): Promise<void> => {
    if (!session) return;

    setMatching(true);
    setError(null);

    try {
      const data = await api<RideRequest[]>(
        `/api/v1/matches/requests/reverse?rideId=${ride.id}&pickupRadiusMeters=2000&dropoffRadiusMeters=2000&limit=20`,
        { token: session.token },
      );
      setRiders(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load rider matches');
    } finally {
      setMatching(false);
    }
  };

  const cancelRide = async (): Promise<void> => {
    if (!session) return;

    setError(null);
    setNotice(null);

    try {
      await api(`/api/v1/rides/${ride.id}`, { method: 'DELETE', token: session.token });
      setNotice('Ride cancelled. Existing bookings can no longer be confirmed.');
      await loadRide();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not cancel the ride');
    }
  };

  return (
    <div className="grid" style={{ gap: 22 }}>
      <div className="card-header" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Ride {shortId(ride.id)}</span>
          <h1 style={{ fontSize: 'clamp(1.8rem, 3.4vw, 2.7rem)', marginTop: 6 }}>
            {ride.originAddress ?? 'Origin'} <span className="gradient-text">→</span>{' '}
            {ride.destinationAddress ?? 'Destination'}
          </h1>
          <div className="item-meta" style={{ marginTop: 8 }}>
            <span>{formatDateTime(ride.departureAt)}</span>
            <span>{relativeTime(ride.departureAt)}</span>
            <span>Driver #{shortId(ride.driverId)}</span>
            <span className="fare-chip">{formatBdt(ride.farePerSeat)} / seat</span>
          </div>
        </div>
        <StatusBadge status={ride.status} />
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <section className="card map-panel">
        <div className="map-toolbar">
          <div>
            <span className="eyebrow">Route view</span>
            <h3>
              {ride.originAddress ?? 'Origin'} <span className="route-arrow">→</span>{' '}
              {ride.destinationAddress ?? 'Destination'}
            </h3>
            <p className="small muted">
              {ride.distanceMeters !== undefined
                ? `${(ride.distanceMeters / 1000).toFixed(1)} km direct corridor`
                : 'Pickup and dropoff plotted from GeoJSON coordinates.'}
            </p>
          </div>
          <div className="map-legend">
            <span className="map-legend-item">
              <span className="map-dot origin" />
              Pickup
            </span>
            <span className="map-legend-item">
              <span className="map-dot destination" />
              Dropoff
            </span>
            <span className="map-legend-item">
              <span className="map-dot route" />
              Route
            </span>
          </div>
        </div>
        <TransitMap
          origin={mapOrigin}
          destination={mapDestination}
          routes={mapRoutes}
          ariaLabel={`Route map from ${ride.originAddress ?? 'origin'} to ${
            ride.destinationAddress ?? 'destination'
          }`}
        />
      </section>

      <div className="split">
        <section className="card">
          <div className="card-header">
            <div>
              <h3>Trip details</h3>
              <p>Everything the API exposes about this ride.</p>
            </div>
          </div>

          <div className="stats" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div className="stat">
              <div className="stat-value">{ride.seatsAvailable}</div>
              <div className="stat-label">Seats available</div>
            </div>
            <div className="stat">
              <div className="stat-value">{formatBdt(ride.farePerSeat)}</div>
              <div className="stat-label">Fare per seat</div>
            </div>
          </div>

          <div className="seat-meter" aria-hidden style={{ marginTop: 12 }}>
            <span
              style={{
                width: `${
                  ride.seatsTotal > 0
                    ? Math.round((ride.seatsAvailable / ride.seatsTotal) * 100)
                    : 0
                }%`,
              }}
            />
          </div>

          <div className="divider" style={{ margin: '16px 0' }} />

          <dl className="kv">
            <dt>Origin</dt>
            <dd>
              {ride.originAddress ?? '—'}{' '}
              <span className="mono muted">
                ({ride.origin.coordinates[1].toFixed(4)}, {ride.origin.coordinates[0].toFixed(4)})
              </span>
            </dd>
            <dt>Destination</dt>
            <dd>
              {ride.destinationAddress ?? '—'}{' '}
              <span className="mono muted">
                ({ride.destination.coordinates[1].toFixed(4)},{' '}
                {ride.destination.coordinates[0].toFixed(4)})
              </span>
            </dd>
            <dt>Departure</dt>
            <dd>{formatDateTime(ride.departureAt)}</dd>
            <dt>Seats</dt>
            <dd>
              {ride.seatsAvailable} free of {ride.seatsTotal}
            </dd>
            <dt>Fare</dt>
            <dd>{formatBdt(ride.farePerSeat)} per seat</dd>
            <dt>Vehicle</dt>
            <dd>
              {ride.vehicle
                ? `${ride.vehicle.make} ${ride.vehicle.model} · ${ride.vehicle.plate} · ${
                    ride.vehicle.ac ? 'AC' : 'Non-AC'
                  }`
                : 'Not specified'}
            </dd>
            <dt>Rider preference</dt>
            <dd>
              {ride.preferences.genderPreference === 'any'
                ? 'Any rider'
                : `${ride.preferences.genderPreference} riders`}{' '}
              · max detour {Math.round(ride.preferences.maxDetourMeters)} m
            </dd>
            <dt>Published</dt>
            <dd>{formatDateTime(ride.createdAt)}</dd>
          </dl>
        </section>

        <section className="grid" style={{ gap: 14 }}>
          {bookable ? (
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>Reserve a seat</h3>
                  <p>Seats are reserved atomically before the booking is written.</p>
                </div>
              </div>

              <div className="form-grid">
                <label className="field span-2">
                  <span className="label">Seats (max {maxSeats})</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={maxSeats}
                    value={seats}
                    onChange={(event) => setSeats(event.target.value)}
                  />
                </label>
              </div>

              <div className="divider" style={{ margin: '14px 0' }} />

              <div className="item-head">
                <span className="small muted">Estimated total</span>
                <span className="fare-chip">{formatBdt(ride.farePerSeat * Number(seats || 1))}</span>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-block"
                style={{ marginTop: 14 }}
                onClick={() => void book()}
                disabled={booking}
              >
                {booking ? 'Reserving…' : 'Book seats'}
              </button>
            </div>
          ) : !session ? (
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>Want a seat?</h3>
                  <p>Sign in to reserve seats on this ride.</p>
                </div>
              </div>
              <Link href="/" className="btn btn-primary btn-block">
                Sign in
              </Link>
            </div>
          ) : isOwner ? (
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>You drive this ride</h3>
                  <p>Reverse-match rider requests or cancel the ride.</p>
                </div>
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void loadRiders()}
                  disabled={matching}
                >
                  {matching ? 'Matching…' : 'Find riders'}
                </button>
                {ride.status !== 'cancelled' && ride.status !== 'completed' ? (
                  <button type="button" className="btn btn-danger" onClick={() => void cancelRide()}>
                    Cancel ride
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>Not bookable</h3>
                  <p>
                    This ride is {ride.status} and has {ride.seatsAvailable} free seat(s).
                  </p>
                </div>
              </div>
              <Link href="/search" className="btn btn-ghost btn-block">
                Find another ride
              </Link>
            </div>
          )}

          <div className="card flat">
            <div className="card-header">
              <div>
                <h3>How booking stays correct</h3>
              </div>
            </div>
            <p className="small muted">
              A single conditional update (<span className="mono">seatsAvailable ≥ seats</span>)
              reserves capacity. The booking row is inserted afterwards; if that insert fails, a
              compensating release puts the seats back. Cancelling restores seats only for the
              request that wins the status transition, so a double-cancel cannot inflate capacity.
            </p>
          </div>
        </section>
      </div>

      {isOwner ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h3>Riders whose intent fits this ride</h3>
              <p>
                Reverse matching uses each rider&apos;s own flex window, dropoff radius and budget.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void loadRiders()}
              disabled={matching}
            >
              {matching ? 'Matching…' : 'Refresh riders'}
            </button>
          </div>

          {riders === null ? (
            <Empty>Run reverse matching to see rider demand on this corridor.</Empty>
          ) : riders.length === 0 ? (
            <Empty>No rider requests fit this ride right now.</Empty>
          ) : (
            <div className="list">
              {riders.map((request) => (
                <div className="traffic-row" key={request.id}>
                  <span className="mono small">#{shortId(request.id)}</span>
                  <div>
                    <div className="small">
                      {request.originAddress ?? 'Origin'} →{' '}
                      {request.destinationAddress ?? 'Destination'}
                    </div>
                    <div className="small muted">
                      {formatDateTime(request.departureAt)} · ±{request.flexMinutes} min ·{' '}
                      {request.seats} seat(s)
                      {request.maxFarePerSeat !== undefined
                        ? ` · budget ${formatBdt(request.maxFarePerSeat)}`
                        : ' · no budget'}
                    </div>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

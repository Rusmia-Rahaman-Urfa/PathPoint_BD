'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Empty,
  Field,
  Spinner,
  Stat,
  StatusBadge,
} from '@/components/ui';
import { api } from '@/lib/api';
import {
  PLACES,
  congestionTone,
  formatBdt,
  formatDateTime,
  formatTime,
  localDateTime,
  placeById,
  relativeTime,
  toIso,
  toPoint,
} from '@/lib/format';
import { useSession } from '@/lib/useSession';
import { useTrafficStream } from '@/lib/useTrafficStream';
import type {
  Booking,
  CongestionLevel,
  Ride,
  RideRequest,
  TrafficStats,
} from '@/lib/types';

type TabId = 'rides' | 'bookings' | 'requests' | 'traffic';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'rides', label: 'My rides' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'requests', label: 'Requests' },
  { id: 'traffic', label: 'Live traffic' },
];

const LEVELS: CongestionLevel[] = ['free', 'moderate', 'heavy', 'severe'];

const routeLabel = (origin?: string, destination?: string): string =>
  `${origin ?? 'Origin'} → ${destination ?? 'Destination'}`;

const shortId = (id: string): string => id.slice(-6).toUpperCase();

export default function DashboardPage() {
  const { session, loading: sessionLoading } = useSession();

  const [tab, setTab] = useState<TabId>('rides');
  const [bookingTab, setBookingTab] = useState<'received' | 'mine'>('received');

  const [rides, setRides] = useState<Ride[]>([]);
  const [received, setReceived] = useState<Booking[]>([]);
  const [mine, setMine] = useState<Booking[]>([]);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [stats, setStats] = useState<TrafficStats | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [reverse, setReverse] = useState<Record<string, RideRequest[]>>({});
  const [reverseBusy, setReverseBusy] = useState<string | null>(null);

  const [originId, setOriginId] = useState('uttara7');
  const [destinationId, setDestinationId] = useState('motijheel');
  const [departure, setDeparture] = useState(() => localDateTime(18));
  const [seatsTotal, setSeatsTotal] = useState('3');
  const [farePerSeat, setFarePerSeat] = useState('80');
  const [genderPreference, setGenderPreference] = useState<'any' | 'female' | 'male'>('any');
  const [maxDetour, setMaxDetour] = useState('3000');
  const [make, setMake] = useState('Toyota');
  const [model, setModel] = useState('Corolla');
  const [plate, setPlate] = useState('DHAKA METRO-GA-00-0000');
  const [ac, setAc] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [simCity, setSimCity] = useState<'dhaka' | 'chattogram'>('dhaka');
  const [simLevel, setSimLevel] = useState<CongestionLevel | ''>('');

  const { events: trafficEvents, status: streamStatus } = useTrafficStream(Boolean(session));

  const loadAll = useCallback(async (): Promise<void> => {
    if (!session) return;

    setLoading(true);
    setError(null);

    const token = session.token;
    const results = await Promise.allSettled([
      api<Ride[]>('/api/v1/rides/mine?limit=50', { token }),
      api<Booking[]>('/api/v1/bookings/received?limit=50', { token }),
      api<Booking[]>('/api/v1/bookings?limit=50', { token }),
      api<RideRequest[]>('/api/v1/matches/requests/mine?limit=50', { token }),
      api<TrafficStats>('/api/v1/traffic/stats'),
    ]);

    const [ridesRes, receivedRes, mineRes, requestsRes, statsRes] = results;

    if (ridesRes.status === 'fulfilled') setRides(ridesRes.value);
    if (receivedRes.status === 'fulfilled') setReceived(receivedRes.value);
    if (mineRes.status === 'fulfilled') setMine(mineRes.value);
    if (requestsRes.status === 'fulfilled') setRequests(requestsRes.value);
    if (statsRes.status === 'fulfilled') setStats(statsRes.value);

    const failure = results.find((result) => result.status === 'rejected');
    if (failure && failure.status === 'rejected') {
      setError(
        failure.reason instanceof Error ? failure.reason.message : 'Could not load the dashboard',
      );
    }

    setLoading(false);
  }, [session]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const runAction = async (
    key: string,
    task: () => Promise<unknown>,
    success: string,
  ): Promise<void> => {
    setBusyAction(key);
    setError(null);
    setNotice(null);
    try {
      await task();
      setNotice(success);
      await loadAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed');
    } finally {
      setBusyAction(null);
    }
  };

  const publishRide = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!session) return;

    setPublishing(true);
    setError(null);
    setNotice(null);

    try {
      const vehicle =
        make.trim() && model.trim() && plate.trim()
          ? { make: make.trim(), model: model.trim(), plate: plate.trim(), ac }
          : undefined;

      const created = await api<Ride>('/api/v1/rides', {
        method: 'POST',
        token: session.token,
        body: {
          origin: toPoint(placeById(originId)),
          destination: toPoint(placeById(destinationId)),
          originAddress: placeById(originId).label,
          destinationAddress: placeById(destinationId).label,
          departureAt: toIso(departure),
          seatsTotal: Number(seatsTotal),
          farePerSeat: Number(farePerSeat),
          status: 'published',
          preferences: {
            genderPreference,
            maxDetourMeters: Number(maxDetour),
          },
          ...(vehicle ? { vehicle } : {}),
        },
      });

      setNotice(`Ride ${shortId(created.id)} published — riders can now find it.`);
      await loadAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish the ride');
    } finally {
      setPublishing(false);
    }
  };

  const loadReverse = async (rideId: string): Promise<void> => {
    if (!session) return;

    setReverseBusy(rideId);
    setError(null);

    try {
      const items = await api<RideRequest[]>(
        `/api/v1/matches/requests/reverse?rideId=${rideId}&pickupRadiusMeters=2000&dropoffRadiusMeters=2000&limit=20`,
        { token: session.token },
      );
      setReverse((current) => ({ ...current, [rideId]: items }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load rider matches');
    } finally {
      setReverseBusy(null);
    }
  };

  const simulate = async (): Promise<void> => {
    if (!session) return;

    setBusyAction('simulate');
    setError(null);

    try {
      await api('/api/v1/traffic/simulate', {
        method: 'POST',
        token: session.token,
        body: {
          city: simCity,
          ...(simLevel ? { level: simLevel } : {}),
        },
      });
      const nextStats = await api<TrafficStats>('/api/v1/traffic/stats');
      setStats(nextStats);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not emit a traffic event');
    } finally {
      setBusyAction(null);
    }
  };

  const counts = useMemo(
    () => ({
      activeRides: rides.filter((ride) => ride.status === 'published' || ride.status === 'full')
        .length,
      pendingReceived: received.filter((booking) => booking.status === 'pending').length,
      activeBookings: mine.filter(
        (booking) => booking.status === 'pending' || booking.status === 'confirmed',
      ).length,
      openRequests: requests.filter((request) => request.status === 'open').length,
    }),
    [rides, received, mine, requests],
  );

  if (sessionLoading) {
    return (
      <div className="center">
        <Spinner label="Restoring your session…" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card auth-card">
        <div className="card-header">
          <div>
            <h2>Dashboard needs a session</h2>
            <p>Sign in to publish rides, manage bookings and watch the live traffic feed.</p>
          </div>
        </div>
        <Link href="/" className="btn btn-primary">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 22 }}>
      <div className="card-header" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Control room</span>
          <h1 style={{ fontSize: 'clamp(1.8rem, 3.4vw, 2.6rem)', marginTop: 6 }}>
            {session.user.name}
          </h1>
          <p className="lede" style={{ marginTop: 4 }}>
            {session.user.email} · {session.user.role} ·{' '}
            {session.user.ratingCount > 0
              ? `${session.user.ratingAvg.toFixed(1)} / 5 rating`
              : 'no ratings yet'}
          </p>
        </div>
        <div className="btn-row">
          <Link href="/search" className="btn btn-secondary btn-sm">
            Find a ride
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void loadAll()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <section className="stats">
        <Stat value={counts.activeRides} label="Active rides" />
        <Stat value={counts.pendingReceived} label="Pending requests" />
        <Stat value={counts.activeBookings} label="My active bookings" />
        <Stat value={counts.openRequests} label="Open ride requests" />
      </section>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="tabs" role="tablist" aria-label="Dashboard sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`tab${tab === item.id ? ' active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? <Spinner label="Loading your workspace…" /> : null}

      {tab === 'rides' ? (
        <div className="split">
          <section className="grid" style={{ gap: 14 }}>
            <div className="card-header" style={{ marginBottom: 0 }}>
              <div>
                <h3>Published rides</h3>
                <p>Open reverse matching to see riders whose intent fits each ride.</p>
              </div>
            </div>

            {rides.length === 0 ? (
              <Empty>You have not published a ride yet. Use the form to offer your first seats.</Empty>
            ) : (
              <div className="list">
                {rides.map((ride) => {
                  const candidates = reverse[ride.id];
                  return (
                    <article className="item" key={ride.id}>
                      <div className="item-head">
                        <div>
                          <strong>
                            {routeLabel(ride.originAddress, ride.destinationAddress)}
                          </strong>
                          <div className="item-meta" style={{ marginTop: 4 }}>
                            <span>{formatDateTime(ride.departureAt)}</span>
                            <span>
                              {ride.seatsAvailable}/{ride.seatsTotal} seats free
                            </span>
                            <span>{formatBdt(ride.farePerSeat)} / seat</span>
                            {ride.vehicle ? (
                              <span>
                                {ride.vehicle.make} {ride.vehicle.model} · {ride.vehicle.plate}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <StatusBadge status={ride.status} />
                      </div>

                      <div className="item-actions">
                        <Link href={`/rides/${ride.id}`} className="btn btn-ghost btn-sm">
                          Open
                        </Link>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={reverseBusy === ride.id}
                          onClick={() => void loadReverse(ride.id)}
                        >
                          {reverseBusy === ride.id ? 'Matching…' : 'Find riders'}
                        </button>
                        {ride.status !== 'cancelled' && ride.status !== 'completed' ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={busyAction === `cancel-ride-${ride.id}`}
                            onClick={() =>
                              void runAction(
                                `cancel-ride-${ride.id}`,
                                () =>
                                  api(`/api/v1/rides/${ride.id}`, {
                                    method: 'DELETE',
                                    token: session.token,
                                  }),
                                'Ride cancelled.',
                              )
                            }
                          >
                            Cancel ride
                          </button>
                        ) : null}
                      </div>

                      {candidates ? (
                        <div className="divider" />
                      ) : null}
                      {candidates ? (
                        candidates.length === 0 ? (
                          <p className="small muted">
                            No rider requests fit this ride right now. Try again after the next
                            request is published.
                          </p>
                        ) : (
                          <div className="list">
                            {candidates.map((request) => (
                              <div className="traffic-row" key={request.id}>
                                <span className="mono small">#{shortId(request.id)}</span>
                                <div>
                                  <div className="small">
                                    {routeLabel(request.originAddress, request.destinationAddress)}
                                  </div>
                                  <div className="small muted">
                                    {formatDateTime(request.departureAt)} · ±{request.flexMinutes}{' '}
                                    min · {request.seats} seat(s)
                                    {request.maxFarePerSeat !== undefined
                                      ? ` · budget ${formatBdt(request.maxFarePerSeat)}`
                                      : ' · no budget'}
                                    {request.distanceMeters !== undefined
                                      ? ` · pickup ${Math.round(request.distanceMeters)} m`
                                      : ''}
                                  </div>
                                </div>
                                <StatusBadge status={request.status} />
                              </div>
                            ))}
                          </div>
                        )
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h3>Publish a ride</h3>
                <p>Riders on the same corridor will appear in reverse matching.</p>
              </div>
            </div>

            <form className="grid" style={{ gap: 13 }} onSubmit={publishRide}>
              <div className="form-grid">
                <Field label="From">
                  <select
                    className="select"
                    value={originId}
                    onChange={(event) => setOriginId(event.target.value)}
                  >
                    {PLACES.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="To">
                  <select
                    className="select"
                    value={destinationId}
                    onChange={(event) => setDestinationId(event.target.value)}
                  >
                    {PLACES.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Departure" span>
                  <input
                    className="input"
                    type="datetime-local"
                    value={departure}
                    onChange={(event) => setDeparture(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Seats">
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={8}
                    value={seatsTotal}
                    onChange={(event) => setSeatsTotal(event.target.value)}
                  />
                </Field>
                <Field label="Fare / seat (৳)">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={10000}
                    value={farePerSeat}
                    onChange={(event) => setFarePerSeat(event.target.value)}
                  />
                </Field>
                <Field label="Gender preference">
                  <select
                    className="select"
                    value={genderPreference}
                    onChange={(event) =>
                      setGenderPreference(event.target.value as 'any' | 'female' | 'male')
                    }
                  >
                    <option value="any">Any rider</option>
                    <option value="female">Female riders</option>
                    <option value="male">Male riders</option>
                  </select>
                </Field>
                <Field label="Max detour (m)">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={20000}
                    step={100}
                    value={maxDetour}
                    onChange={(event) => setMaxDetour(event.target.value)}
                  />
                </Field>
                <Field label="Vehicle make">
                  <input
                    className="input"
                    value={make}
                    onChange={(event) => setMake(event.target.value)}
                  />
                </Field>
                <Field label="Vehicle model">
                  <input
                    className="input"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                  />
                </Field>
                <Field label="Plate" span>
                  <input
                    className="input"
                    value={plate}
                    onChange={(event) => setPlate(event.target.value)}
                  />
                </Field>
              </div>

              <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={ac} onChange={(event) => setAc(event.target.checked)} />
                <span className="small">Air conditioned</span>
              </label>

              <button className="btn btn-primary" type="submit" disabled={publishing}>
                {publishing ? 'Publishing…' : 'Publish ride'}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {tab === 'bookings' ? (
        <section className="grid" style={{ gap: 14 }}>
          <div className="tabs" role="tablist" aria-label="Booking lists">
            <button
              type="button"
              role="tab"
              aria-selected={bookingTab === 'received'}
              className={`tab${bookingTab === 'received' ? ' active' : ''}`}
              onClick={() => setBookingTab('received')}
            >
              Received as driver ({received.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={bookingTab === 'mine'}
              className={`tab${bookingTab === 'mine' ? ' active' : ''}`}
              onClick={() => setBookingTab('mine')}
            >
              My bookings ({mine.length})
            </button>
          </div>

          {bookingTab === 'received' ? (
            received.length === 0 ? (
              <Empty>No bookings yet. Publish a ride and riders will reserve seats.</Empty>
            ) : (
              <div className="list">
                {received.map((booking) => (
                  <article className="item" key={booking.id}>
                    <div className="item-head">
                      <div>
                        <strong>
                          {booking.rider?.name ?? `Rider #${shortId(booking.riderId)}`}
                        </strong>
                        <div className="item-meta" style={{ marginTop: 4 }}>
                          <span>
                            {routeLabel(
                              booking.ride?.originAddress,
                              booking.ride?.destinationAddress,
                            )}
                          </span>
                          <span>{formatDateTime(booking.rideDepartureAt)}</span>
                          <span>
                            {booking.seats} seat(s) · {formatBdt(booking.totalFare)}
                          </span>
                          {booking.rider?.phone ? <span>{booking.rider.phone}</span> : null}
                        </div>
                      </div>
                      <StatusBadge status={booking.status} />
                    </div>

                    <div className="item-actions">
                      {booking.status === 'pending' ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyAction === `confirm-${booking.id}`}
                          onClick={() =>
                            void runAction(
                              `confirm-${booking.id}`,
                              () =>
                                api(`/api/v1/bookings/${booking.id}/confirm`, {
                                  method: 'POST',
                                  token: session.token,
                                }),
                              'Booking confirmed.',
                            )
                          }
                        >
                          Confirm
                        </button>
                      ) : null}
                      {booking.status === 'pending' || booking.status === 'confirmed' ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={busyAction === `cancel-booking-${booking.id}`}
                          onClick={() =>
                            void runAction(
                              `cancel-booking-${booking.id}`,
                              () =>
                                api(`/api/v1/bookings/${booking.id}/cancel`, {
                                  method: 'POST',
                                  token: session.token,
                                  body: { reason: 'Cancelled by driver' },
                                }),
                              'Booking cancelled and seats restored.',
                            )
                          }
                        >
                          Cancel
                        </button>
                      ) : null}
                      <Link href={`/rides/${booking.rideId}`} className="btn btn-ghost btn-sm">
                        View ride
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : mine.length === 0 ? (
            <Empty>
              You have not booked a ride yet.{' '}
              <Link href="/search" className="gradient-text">
                Find a ride →
              </Link>
            </Empty>
          ) : (
            <div className="list">
              {mine.map((booking) => (
                <article className="item" key={booking.id}>
                  <div className="item-head">
                    <div>
                      <strong>
                        {routeLabel(booking.ride?.originAddress, booking.ride?.destinationAddress)}
                      </strong>
                      <div className="item-meta" style={{ marginTop: 4 }}>
                        <span>{formatDateTime(booking.rideDepartureAt)}</span>
                        <span>
                          {booking.seats} seat(s) · {formatBdt(booking.totalFare)}
                        </span>
                        <span>Driver #{shortId(booking.driverId)}</span>
                        {booking.ride ? <span>Ride {booking.ride.status}</span> : null}
                      </div>
                    </div>
                    <StatusBadge status={booking.status} />
                  </div>

                  <div className="item-actions">
                    {booking.status === 'pending' || booking.status === 'confirmed' ? (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={busyAction === `cancel-booking-${booking.id}`}
                        onClick={() =>
                          void runAction(
                            `cancel-booking-${booking.id}`,
                            () =>
                              api(`/api/v1/bookings/${booking.id}/cancel`, {
                                method: 'POST',
                                token: session.token,
                                body: { reason: 'Cancelled by rider' },
                              }),
                            'Booking cancelled and seats restored.',
                          )
                        }
                      >
                        Cancel booking
                      </button>
                    ) : null}
                    <Link href={`/rides/${booking.rideId}`} className="btn btn-ghost btn-sm">
                      View ride
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'requests' ? (
        <section className="grid" style={{ gap: 14 }}>
          <div className="card-header" style={{ marginBottom: 0 }}>
            <div>
              <h3>My ride requests</h3>
              <p>
                Rider intent is discoverable by drivers on the same corridor. Cancel an open
                request any time.
              </p>
            </div>
            <Link href="/search" className="btn btn-secondary btn-sm">
              Publish a request
            </Link>
          </div>

          {requests.length === 0 ? (
            <Empty>No ride requests yet. Publish one from the search page.</Empty>
          ) : (
            <div className="list">
              {requests.map((request) => (
                <article className="item" key={request.id}>
                  <div className="item-head">
                    <div>
                      <strong>
                        {routeLabel(request.originAddress, request.destinationAddress)}
                      </strong>
                      <div className="item-meta" style={{ marginTop: 4 }}>
                        <span>{formatDateTime(request.departureAt)}</span>
                        <span>±{request.flexMinutes} min</span>
                        <span>{request.seats} seat(s)</span>
                        <span>
                          {request.maxFarePerSeat !== undefined
                            ? `Budget ${formatBdt(request.maxFarePerSeat)} / seat`
                            : 'No budget ceiling'}
                        </span>
                      </div>
                      {request.notes ? <p className="small muted">{request.notes}</p> : null}
                    </div>
                    <StatusBadge status={request.status} />
                  </div>

                  {request.status === 'open' ? (
                    <div className="item-actions">
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={busyAction === `cancel-request-${request.id}`}
                        onClick={() =>
                          void runAction(
                            `cancel-request-${request.id}`,
                            () =>
                              api(`/api/v1/matches/requests/${request.id}`, {
                                method: 'DELETE',
                                token: session.token,
                              }),
                            'Ride request cancelled.',
                          )
                        }
                      >
                        Cancel request
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'traffic' ? (
        <section className="grid" style={{ gap: 14 }}>
          <div className="card-header" style={{ marginBottom: 0 }}>
            <div>
              <h3>
                <span className={`live-dot ${streamStatus === 'live' ? 'on' : ''}`} /> Live
                congestion
              </h3>
              <p>
                Public Server-Sent Events feed. {stats ? `${stats.clients} subscriber(s)` : '…'} ·{' '}
                {stats?.simulatorRunning ? `simulator every ${stats.intervalMs / 1000}s` : 'simulator off'}
              </p>
            </div>
            <div className="btn-row">
              <select
                className="select"
                style={{ width: 'auto' }}
                value={simCity}
                onChange={(event) => setSimCity(event.target.value as 'dhaka' | 'chattogram')}
              >
                <option value="dhaka">Dhaka</option>
                <option value="chattogram">Chattogram</option>
              </select>
              <select
                className="select"
                style={{ width: 'auto' }}
                value={simLevel}
                onChange={(event) => setSimLevel(event.target.value as CongestionLevel | '')}
              >
                <option value="">Random level</option>
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void simulate()}
                disabled={busyAction === 'simulate'}
              >
                {busyAction === 'simulate' ? 'Emitting…' : 'Emit event'}
              </button>
            </div>
          </div>

          {trafficEvents.length === 0 ? (
            <Empty>
              {streamStatus === 'error'
                ? 'Stream unavailable — is the API running?'
                : 'Waiting for the next congestion event…'}
            </Empty>
          ) : (
            <div className="list">
              {trafficEvents.map((event) => (
                <div className="traffic-row" key={event.id}>
                  <span className={`badge ${congestionTone[event.level]}`}>{event.level}</span>
                  <div>
                    <div className="small">
                      <strong>{event.corridor}</strong> · {event.city}
                    </div>
                    <div className="small muted">
                      {event.speedKph} km/h · +{event.delayMinutes} min delay ·{' '}
                      {event.source === 'manual' ? 'manual' : 'simulator'}
                    </div>
                  </div>
                  <span className="small muted traffic-time">{formatTime(event.observedAt)}</span>
                </div>
              ))}
            </div>
          )}

          <p className="small muted">
            {trafficEvents.length > 0
              ? `Newest event ${relativeTime(trafficEvents[0]!.observedAt)} · buffer capped at 100 on the server.`
              : 'Events are buffered in memory on the API process and replayed to new subscribers.'}
          </p>
        </section>
      ) : null}
    </div>
  );
}

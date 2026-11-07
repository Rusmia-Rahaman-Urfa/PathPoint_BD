'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Breakdown,
  Empty,
  Field,
  ScoreRing,
  Spinner,
} from '@/components/ui';
import { api, request } from '@/lib/api';
import {
  PLACES,
  formatBdt,
  formatDateTime,
  localDateTime,
  placeById,
  toIso,
  toPoint,
} from '@/lib/format';
import { useSession } from '@/lib/useSession';
import type { MatchCard as MatchCardData, MatchSearchResult, RideRequest } from '@/lib/types';

const CITIES: Array<{ id: 'dhaka' | 'chattogram'; label: string }> = [
  { id: 'dhaka', label: 'Dhaka' },
  { id: 'chattogram', label: 'Chattogram' },
];

function MatchResult({
  card,
  busy,
  onBook,
}: {
  card: MatchCardData;
  busy: boolean;
  onBook: (rideId: string) => void;
}) {
  const { ride, score, breakdown } = card;
  const driverTag = ride.driverId.slice(-6).toUpperCase();

  return (
    <article className="card flat match-card">
      <div className="match-top">
        <div>
          <div className="route">
            {ride.originAddress ?? 'Origin'}
            <span className="route-arrow">→</span>
            {ride.destinationAddress ?? 'Destination'}
          </div>
          <div className="item-meta" style={{ marginTop: 6 }}>
            <span>{formatDateTime(ride.departureAt)}</span>
            <span>
              {ride.seatsAvailable} of {ride.seatsTotal} seats free
            </span>
            <span>{formatBdt(ride.farePerSeat)} / seat</span>
            {ride.vehicle ? (
              <span>
                {ride.vehicle.make} {ride.vehicle.model} · {ride.vehicle.ac ? 'AC' : 'Non-AC'}
              </span>
            ) : null}
            <span>Driver #{driverTag}</span>
          </div>
        </div>
        <ScoreRing score={score} />
      </div>

      <Breakdown breakdown={breakdown} />

      <div className="btn-row" style={{ justifyContent: 'space-between' }}>
        <span className="small muted">
          {ride.preferences.genderPreference === 'any'
            ? 'Open to any rider'
            : `${ride.preferences.genderPreference} riders preferred`}
        </span>
        <div className="btn-row">
          <Link href={`/rides/${ride.id}`} className="btn btn-ghost btn-sm">
            Details
          </Link>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || ride.seatsAvailable < 1}
            onClick={() => onBook(ride.id)}
          >
            {busy ? 'Reserving…' : 'Book 1 seat'}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function SearchPage() {
  const { session, loading } = useSession();

  const [originId, setOriginId] = useState('banani');
  const [destinationId, setDestinationId] = useState('dhanmondi27');
  const [departure, setDeparture] = useState(() => localDateTime(3));
  const [flexMinutes, setFlexMinutes] = useState('30');
  const [seats, setSeats] = useState('1');
  const [pickupRadius, setPickupRadius] = useState('2000');
  const [dropoffRadius, setDropoffRadius] = useState('2000');

  const [result, setResult] = useState<MatchSearchResult | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [searching, setSearching] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [requestFlex, setRequestFlex] = useState('30');
  const [requestSeats, setRequestSeats] = useState('1');
  const [maxFare, setMaxFare] = useState('');
  const [notes, setNotes] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [published, setPublished] = useState<RideRequest | null>(null);

  const runSearch = async (event?: FormEvent<HTMLFormElement>): Promise<void> => {
    event?.preventDefault();
    if (!session) return;

    setSearching(true);
    setError(null);
    setNotice(null);

    try {
      const response = await request<MatchSearchResult>('/api/v1/matches/search', {
        method: 'POST',
        token: session.token,
        body: {
          origin: toPoint(placeById(originId)),
          destination: toPoint(placeById(destinationId)),
          departureAt: toIso(departure),
          flexMinutes: Number(flexMinutes),
          seats: Number(seats),
          pickupRadiusMeters: Number(pickupRadius),
          dropoffRadiusMeters: Number(dropoffRadius),
          limit: 20,
        },
      });

      setResult(response.data);
      setMeta(response.meta ?? null);
    } catch (cause) {
      setResult(null);
      setMeta(null);
      setError(cause instanceof Error ? cause.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const book = async (rideId: string): Promise<void> => {
    if (!session) return;

    setBookingId(rideId);
    setError(null);
    setNotice(null);

    try {
      const booking = await api<{ id: string }>(`/api/v1/rides/${rideId}/bookings`, {
        method: 'POST',
        token: session.token,
        body: { seats: 1 },
      });
      // Refresh the result list so seat counts and availability points are accurate,
      // then surface the booking notice (runSearch clears notices when it starts).
      await runSearch();
      setNotice(
        `Seat reserved — booking ${booking.id.slice(-6).toUpperCase()} is pending driver confirmation.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Booking failed');
    } finally {
      setBookingId(null);
    }
  };

  const publishRequest = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!session) return;

    setPublishing(true);
    setRequestError(null);
    setPublished(null);

    try {
      const created = await api<RideRequest>('/api/v1/matches/requests', {
        method: 'POST',
        token: session.token,
        body: {
          origin: toPoint(placeById(originId)),
          destination: toPoint(placeById(destinationId)),
          originAddress: placeById(originId).label,
          destinationAddress: placeById(destinationId).label,
          departureAt: toIso(departure),
          flexMinutes: Number(requestFlex),
          seats: Number(requestSeats),
          ...(maxFare.trim() ? { maxFarePerSeat: Number(maxFare) } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      setPublished(created);
      setNotes('');
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : 'Could not publish the request');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
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
            <h2>Sign in to search</h2>
            <p>Matching is authenticated so every search is tied to a real rider.</p>
          </div>
        </div>
        <div className="btn-row">
          <Link href="/" className="btn btn-primary">
            Sign in
          </Link>
          <Link href="/" className="btn btn-ghost">
            Back to overview
          </Link>
        </div>
      </div>
    );
  }

  const matches = result?.matches ?? [];

  return (
    <div className="grid" style={{ gap: 22 }}>
      <div className="card-header" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Commute search</span>
          <h1 style={{ fontSize: 'clamp(1.8rem, 3.4vw, 2.6rem)', marginTop: 6 }}>
            Find a ride that <span className="gradient-text">fits</span>.
          </h1>
          <p className="lede" style={{ marginTop: 6 }}>
            The search window is your departure time ± flex. Every result exposes the exact score
            breakdown, so you can see why a ride ranked where it did.
          </p>
        </div>
        <Badge tone={session.user.role === 'driver' ? 'tone-moderate' : 'tone-free'}>
          {session.user.role}
        </Badge>
      </div>

      <div className="split">
        <section className="card">
          <div className="card-header">
            <div>
              <h3>Search rides</h3>
              <p>Pick a corridor, a time and how far you will walk.</p>
            </div>
          </div>

          <form className="grid" style={{ gap: 13 }} onSubmit={runSearch}>
            <div className="form-grid">
              <Field label="From">
                <select
                  className="select"
                  value={originId}
                  onChange={(event) => setOriginId(event.target.value)}
                >
                  {CITIES.map((city) => (
                    <optgroup key={city.id} label={city.label}>
                      {PLACES.filter((place) => place.city === city.id).map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>

              <Field label="To">
                <select
                  className="select"
                  value={destinationId}
                  onChange={(event) => setDestinationId(event.target.value)}
                >
                  {CITIES.map((city) => (
                    <optgroup key={city.id} label={city.label}>
                      {PLACES.filter((place) => place.city === city.id).map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.label}
                        </option>
                      ))}
                    </optgroup>
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

              <Field label="Flex (minutes)">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={240}
                  value={flexMinutes}
                  onChange={(event) => setFlexMinutes(event.target.value)}
                />
              </Field>

              <Field label="Seats">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={8}
                  value={seats}
                  onChange={(event) => setSeats(event.target.value)}
                />
              </Field>

              <Field label="Pickup radius (m)">
                <input
                  className="input"
                  type="number"
                  min={100}
                  max={20000}
                  step={100}
                  value={pickupRadius}
                  onChange={(event) => setPickupRadius(event.target.value)}
                />
              </Field>

              <Field label="Dropoff radius (m)">
                <input
                  className="input"
                  type="number"
                  min={100}
                  max={20000}
                  step={100}
                  value={dropoffRadius}
                  onChange={(event) => setDropoffRadius(event.target.value)}
                />
              </Field>
            </div>

            {error ? <Alert tone="error">{error}</Alert> : null}
            {notice ? <Alert tone="success">{notice}</Alert> : null}

            <button className="btn btn-primary" type="submit" disabled={searching}>
              {searching ? 'Searching…' : 'Search matches'}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h3>Publish a ride request</h3>
              <p>Let drivers heading your way find you through reverse matching.</p>
            </div>
          </div>

          <form className="grid" style={{ gap: 13 }} onSubmit={publishRequest}>
            <p className="small muted">
              Uses the same origin, destination and departure as the search above.
            </p>

            <div className="form-grid">
              <Field label="Flex (minutes)">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={240}
                  value={requestFlex}
                  onChange={(event) => setRequestFlex(event.target.value)}
                />
              </Field>
              <Field label="Seats">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={8}
                  value={requestSeats}
                  onChange={(event) => setRequestSeats(event.target.value)}
                />
              </Field>
              <Field label="Max fare / seat (৳)" span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={10000}
                  placeholder="Optional budget ceiling"
                  value={maxFare}
                  onChange={(event) => setMaxFare(event.target.value)}
                />
              </Field>
              <Field label="Notes" span>
                <textarea
                  className="textarea"
                  rows={3}
                  maxLength={280}
                  placeholder="e.g. Can leave 10 minutes early, one small bag"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
            </div>

            {requestError ? <Alert tone="error">{requestError}</Alert> : null}
            {published ? (
              <Alert tone="success">
                Request published — <span className="mono">{published.id.slice(-6).toUpperCase()}</span>{' '}
                is open for drivers until {formatDateTime(published.departureAt)}.
              </Alert>
            ) : null}

            <button className="btn btn-secondary" type="submit" disabled={publishing}>
              {publishing ? 'Publishing…' : 'Publish request'}
            </button>
          </form>
        </section>
      </div>

      <section className="grid" style={{ gap: 12 }}>
        <div className="card-header" style={{ marginBottom: 0 }}>
          <div>
            <h3>
              {result ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : 'Results'}
            </h3>
            {result ? (
              <p>
                Window {formatDateTime(result.query.windowStart)} —{' '}
                {formatDateTime(result.query.windowEnd)} · {result.query.seats} seat(s) ·{' '}
                {meta
                  ? `${String(meta.candidates)} candidates, ${String(meta.rejectedBearing)} rejected on bearing`
                  : 'scored server-side'}
              </p>
            ) : (
              <p>Run a search to see scored rides across the corridor.</p>
            )}
          </div>
        </div>

        {searching ? (
          <Spinner label="Scoring candidate rides…" />
        ) : matches.length > 0 ? (
          <div className="list">
            {matches.map((card) => (
              <MatchResult
                key={card.ride.id}
                card={card}
                busy={bookingId === card.ride.id}
                onBook={(rideId) => void book(rideId)}
              />
            ))}
          </div>
        ) : result ? (
          <Empty>
            No ride fits that corridor and time window. Widen the flex or radius, or publish a
            request so a driver can find you.
          </Empty>
        ) : (
          <Empty>Nothing searched yet.</Empty>
        )}
      </section>
    </div>
  );
}

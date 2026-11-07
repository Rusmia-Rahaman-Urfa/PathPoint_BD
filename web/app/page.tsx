'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Field, Spinner, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/useSession';
import type { AuthResponse, Role } from '@/lib/types';

const SEED_PASSWORD = 'PathPoint123';

const DEMO_ACCOUNTS: Array<{ name: string; email: string; role: Role; city: string }> = [
  { name: 'Rafiq Hasan', email: 'driver.uttara@pathpoint.test', role: 'driver', city: 'Uttara' },
  { name: 'Nusrat Jahan', email: 'driver.banani@pathpoint.test', role: 'driver', city: 'Banani' },
  { name: 'Farhana Akter', email: 'driver.gec@pathpoint.test', role: 'driver', city: 'Chattogram' },
  { name: 'Sabrina Rahman', email: 'rider.dhanmondi@pathpoint.test', role: 'rider', city: 'Dhanmondi' },
  { name: 'Arif Hossain', email: 'rider.agrabad@pathpoint.test', role: 'rider', city: 'Agrabad' },
];

export default function HomePage() {
  const router = useRouter();
  const { session, loading, setSession } = useSession();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('rider.dhanmondi@pathpoint.test');
  const [password, setPassword] = useState(SEED_PASSWORD);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'rider' | 'driver'>('rider');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (nextEmail: string, nextPassword: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const auth = await api<AuthResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: { email: nextEmail, password: nextPassword },
      });
      setSession(auth);
      router.push('/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (mode === 'login') {
      await signIn(email, password);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const auth = await api<AuthResponse>('/api/v1/auth/register', {
        method: 'POST',
        body: {
          name,
          email,
          password,
          role,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        },
      });
      setSession(auth);
      router.push('/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the account');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="center">
        <Spinner label="Restoring your session…" />
      </div>
    );
  }

  if (session) {
    const user = session.user;

    return (
      <div className="grid" style={{ gap: 28 }}>
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-rail" aria-hidden>
              <span className="hero-rail-node" />
              <span className="hero-rail-node" />
              <span className="hero-rail-node" />
            </span>
            <span className="eyebrow">Signed in as {user.role}</span>
            <h1>
              Good to see you, <span className="gradient-text">{user.name.split(' ')[0]}</span>.
            </h1>
            <p className="lede">
              Search the commute corridor, book a seat with an atomic reservation, or publish your
              own ride and let reverse matching find riders heading your way.
            </p>
            <div className="hero-actions">
              <Link href="/search" className="btn btn-primary">
                Find a ride
              </Link>
              <Link href="/dashboard" className="btn btn-ghost">
                Open dashboard
              </Link>
            </div>
            <div className="hero-meta">
              <span>Express 5</span>
              <span>2dsphere</span>
              <span>JWT</span>
              <span>SSE</span>
            </div>
          </div>

          <div className="card auth-card">
            <div className="pass-head">
              <div>
                <span className="pass-code">PP / BD · Account</span>
                <h3>{user.name}</h3>
              </div>
              <Badge tone="tone-free">{user.role}</Badge>
            </div>
            <dl className="kv">
              <dt>Email</dt>
              <dd>{user.email}</dd>
              <dt>Phone</dt>
              <dd>{user.phone ?? '—'}</dd>
              <dt>Rating</dt>
              <dd>
                {user.ratingCount > 0
                  ? `${user.ratingAvg.toFixed(1)} / 5 (${user.ratingCount})`
                  : 'No ratings yet'}
              </dd>
              <dt>Member since</dt>
              <dd>{formatDateTime(user.createdAt)}</dd>
            </dl>
            <p className="small muted" style={{ marginTop: 14 }}>
              Issued by the Express API, stored in this browser only.
            </p>
          </div>
        </section>

        <section className="stats">
          <Stat value={user.role === 'driver' ? 'Driver' : 'Rider'} label="Mode" />
          <Stat value={user.ratingAvg.toFixed(1)} label="Rating" />
          <Stat value={user.ratingCount} label="Trips rated" />
          <Stat value={user.isActive ? 'Active' : 'Paused'} label="Status" />
        </section>

        <section className="grid three">
          <article className="feature">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" strokeLinecap="round" />
                <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <h3>Geospatial matching</h3>
            <p>
              Pickup, dropoff, time, bearing and seat availability scored out of 100 — with the
              full breakdown visible on every result.
            </p>
          </article>
          <article className="feature">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="4.5" y="10" width="15" height="9.5" rx="2.4" />
                <path d="M8 10V7.6a4 4 0 0 1 8 0V10" strokeLinecap="round" />
                <circle cx="12" cy="14.7" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <h3>Atomic bookings</h3>
            <p>
              One conditional update reserves seats, and a compensating write restores them on
              cancellation. Concurrent riders can never oversell a ride.
            </p>
          </article>
          <article className="feature">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path
                  d="M2.5 12.5h4l2.2-5.4 3.4 10.2 2.4-6 1.7 3.2h5.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3>Live traffic</h3>
            <p>
              Congestion events stream over Server-Sent Events, so the dashboard updates without a
              refresh.
            </p>
          </article>
        </section>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 28 }}>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-rail" aria-hidden>
            <span className="hero-rail-node" />
            <span className="hero-rail-node" />
            <span className="hero-rail-node" />
          </span>
          <span className="eyebrow">Dhaka · Chattogram</span>
          <h1>
            Your city, <span className="gradient-text">matched</span> to your commute.
          </h1>
          <p className="lede">
            PathPoint_BD pairs commuters heading the same way with drivers already making the trip.
            Geospatial search, transparent scoring, and seat booking that stays correct under
            concurrency.
          </p>
          <div className="hero-actions">
            <a href="#signin" className="btn btn-primary">
              Sign in to start
            </a>
            <Link href="/search" className="btn btn-ghost">
              Browse rides
            </Link>
          </div>
          <div className="hero-meta">
            <span>Express 5</span>
            <span>MongoDB 2dsphere</span>
            <span>JWT</span>
            <span>SSE</span>
            <span>Zod strict validation</span>
          </div>
        </div>

        <div className="card auth-card" id="signin">
          <div className="pass-head">
            <div>
              <span className="pass-code">PP / BD · Access pass</span>
              <h3>{mode === 'login' ? 'Commuter sign-in' : 'Create your pass'}</h3>
            </div>
            <span className="pass-badge">Live</span>
          </div>

          <div className="auth-switch" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'active' : ''}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
            >
              Create account
            </button>
          </div>

          <form className="grid" style={{ gap: 13 }} onSubmit={submit}>
            {mode === 'register' ? (
              <>
                <Field label="Full name">
                  <input
                    className="input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ayesha Karim"
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </Field>
                <Field label="Phone (optional)">
                  <input
                    className="input"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+8801712345678"
                    pattern="^\+8801[3-9]\d{8}$"
                  />
                </Field>
                <Field label="Account type">
                  <select
                    className="select"
                    value={role}
                    onChange={(event) => setRole(event.target.value as 'rider' | 'driver')}
                  >
                    <option value="rider">Rider — book seats</option>
                    <option value="driver">Driver — publish rides</option>
                  </select>
                </Field>
              </>
            ) : null}

            <Field label="Email">
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </Field>

            <Field label="Password">
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                maxLength={72}
                required
              />
            </Field>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>

            <p className="small muted">
              The seeded demo password is <span className="mono">{SEED_PASSWORD}</span>. Run{' '}
              <span className="mono">npm run seed</span> once against your database.
            </p>
          </form>
        </div>
      </section>

      <section className="card flat">
        <div className="card-header">
          <div>
            <h3>One-click demo accounts</h3>
            <p>Seeded drivers and riders, ready to log in with the demo password.</p>
          </div>
          <Badge tone="tone-moderate">demo</Badge>
        </div>
        <div className="grid three demo-grid">
          {DEMO_ACCOUNTS.map((account) => (
            <div className="item" key={account.email}>
              <div className="item-head">
                <div>
                  <strong>{account.name}</strong>
                  <div className="small muted">{account.city}</div>
                </div>
                <Badge tone={account.role === 'driver' ? 'tone-moderate' : 'tone-free'}>
                  {account.role}
                </Badge>
              </div>
              <div className="mono small muted">{account.email}</div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => void signIn(account.email, SEED_PASSWORD)}
              >
                Sign in as {account.name.split(' ')[0]}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

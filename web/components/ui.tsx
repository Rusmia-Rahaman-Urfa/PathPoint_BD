'use client';

import type { CSSProperties, ReactNode } from 'react';
import { formatDistance, scoreTone, statusTone } from '@/lib/format';
import type { MatchBreakdown } from '@/lib/types';

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success';
  children: ReactNode;
}) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="alert-mark" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] ?? 'tone-neutral'}>{status}</Badge>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-mark" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="btn-row" style={{ alignItems: 'center' }} aria-live="polite">
      <span className="spinner" aria-hidden />
      {label ? <span className="small muted">{label}</span> : null}
    </div>
  );
}

export function ScoreRing({ score }: { score: number }) {
  const rounded = Math.round(score);

  return (
    <div className="score">
      <div
        className="score-ring"
        style={{ '--value': rounded } as CSSProperties}
        title={`${rounded} of 100`}
        role="img"
        aria-label={`Match score ${rounded} of 100`}
      >
        <span>{rounded}</span>
      </div>
      <div className="score-meta">
        <div className={`factor-label ${scoreTone(score)}`}>Match</div>
        <div className="small muted">/ 100</div>
      </div>
    </div>
  );
}

export function Breakdown({ breakdown }: { breakdown: MatchBreakdown }) {
  const rows = [
    {
      label: 'Pickup',
      points: breakdown.pickup.points,
      max: breakdown.pickup.max,
      detail: formatDistance(breakdown.pickup.distanceMeters),
    },
    {
      label: 'Dropoff',
      points: breakdown.dropoff.points,
      max: breakdown.dropoff.max,
      detail: formatDistance(breakdown.dropoff.distanceMeters),
    },
    {
      label: 'Time',
      points: breakdown.time.points,
      max: breakdown.time.max,
      detail: `±${Math.round(breakdown.time.deltaMinutes)} min`,
    },
    {
      label: 'Bearing',
      points: breakdown.bearing.points,
      max: breakdown.bearing.max,
      detail: `${Math.round(breakdown.bearing.deltaDegrees)}° off`,
    },
    {
      label: 'Seats',
      points: breakdown.availability.points,
      max: breakdown.availability.max,
      detail: `${breakdown.availability.seatsAvailable}/${breakdown.availability.seatsTotal} free`,
    },
  ];

  return (
    <div className="breakdown">
      {rows.map((row) => (
        <div className="factor" key={row.label}>
          <div className="factor-label">{row.label}</div>
          <div className="factor-value">
            {Math.round(row.points)}
            <span className="muted small">/{row.max}</span>
          </div>
          <div className="factor-bar" aria-hidden>
            <span
              style={{
                width: `${Math.max(0, Math.min(100, (row.points / row.max) * 100))}%`,
              }}
            />
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {row.detail}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Field({
  label,
  children,
  span = false,
}: {
  label: string;
  children: ReactNode;
  span?: boolean;
}) {
  return (
    <label className={`field${span ? ' span-2' : ''}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

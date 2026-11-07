'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/search', label: 'Find a ride' },
  { href: '/dashboard', label: 'Dashboard' },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, setSession } = useSession();

  const signOut = (): void => {
    setSession(null);
    router.push('/');
  };

  const initials = session
    ? session.user.name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
    : '';

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand" aria-label="PathPoint_BD home">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 32 32" fill="none">
              <path
                d="M8 23V14a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="8" cy="25" r="2.6" fill="currentColor" />
              <circle cx="24" cy="25" r="2.6" fill="currentColor" />
            </svg>
          </span>
          <span className="brand-text">
            PathPoint <small>BD</small>
          </span>
        </Link>

        <nav className="nav-links" aria-label="Main">
          {LINKS.map((link) => {
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="nav-user">
          {session ? (
            <>
              <span className="nav-avatar" aria-hidden>
                {initials}
              </span>
              <span className="nav-user-meta">
                <strong>{session.user.name}</strong>
                <span>{session.user.role}</span>
              </span>
              <button type="button" className="btn btn-ghost btn-sm nav-signout" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/" className="btn btn-primary btn-sm">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

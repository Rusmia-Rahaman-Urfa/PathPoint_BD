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

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand" aria-label="PathPoint_BD home">
          <span className="brand-mark" aria-hidden />
          <span>
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
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="nav-user">
          {session ? (
            <>
              <span className="live-dot on" aria-hidden />
              <span>
                <strong>{session.user.name}</strong> · {session.user.role}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
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

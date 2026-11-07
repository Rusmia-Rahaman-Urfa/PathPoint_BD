'use client';

import { useCallback, useEffect, useState } from 'react';
import { clearSession, getSession, saveSession, type StoredSession } from './session';
import type { AuthResponse } from './types';

/**
 * Broadcast channel so every `useSession()` instance (nav + page) reacts to a
 * sign-in/sign-out in the same tab. The native `storage` event only fires in
 * *other* tabs, hence the custom event.
 */
const SESSION_EVENT = 'pathpoint:session';

function broadcast(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_EVENT));
  }
}

/**
 * Hydration-safe session hook. `session === undefined` means "not read yet";
 * pages use that to avoid flashing the login form on a hard refresh.
 */
export function useSession() {
  const [session, setSessionState] = useState<StoredSession | null | undefined>(undefined);

  useEffect(() => {
    const sync = (): void => setSessionState(getSession());

    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(SESSION_EVENT, sync);

    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(SESSION_EVENT, sync);
    };
  }, []);

  const setSession = useCallback((auth: AuthResponse | null) => {
    if (auth) {
      saveSession(auth);
      setSessionState(getSession());
    } else {
      clearSession();
      setSessionState(null);
    }
    broadcast();
  }, []);

  return {
    session,
    loading: session === undefined,
    setSession,
  };
}

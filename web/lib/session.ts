import type { AuthResponse, User } from './types';

const STORAGE_KEY = 'pathpoint.session.v1';

export interface StoredSession {
  token: string;
  user: User;
  savedAt: number;
}

export function getSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.token || !parsed.user) return null;

    return {
      token: parsed.token,
      user: parsed.user as User,
      savedAt: parsed.savedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveSession(auth: AuthResponse): StoredSession {
  const session: StoredSession = {
    token: auth.accessToken,
    user: auth.user,
    savedAt: Date.now(),
  };

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  return session;
}

export function clearSession(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

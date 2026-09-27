import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { configureApi } from '../api/client';
import {
  clearSession,
  isExpiring,
  loadSession,
  refreshSession,
  saveSession,
  signInWithPassword,
  type Session,
} from './session';

type AuthState = {
  /** null while the stored session is still being read from SecureStore. */
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // The API client reads the session through a ref so a token refresh never
  // leaves it holding a stale closure.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  /** Returns a valid session, refreshing it first when the token is stale. */
  const getValidSession = useCallback(async (): Promise<Session | null> => {
    const current = sessionRef.current;
    if (!current) return null;
    if (!isExpiring(current)) return current;

    const result = await refreshSession(current.refresh_token);
    if ('error' in result) {
      await clearSession();
      sessionRef.current = null;
      setSession(null);
      return null;
    }
    sessionRef.current = result.session;
    setSession(result.session);
    await saveSession(result.session);
    return result.session;
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    sessionRef.current = null;
    setSession(null);
  }, []);

  // Install the accessor before any screen can issue a request.
  configureApi(getValidSession, () => {
    void signOut();
  });

  // Restore a stored session on cold start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadSession();
      if (cancelled) return;
      if (stored) {
        sessionRef.current = stored;
        setSession(stored);
        // Refresh eagerly so the first screen never renders against a dead token.
        if (isExpiring(stored)) await getValidSession();
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [getValidSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await signInWithPassword(email, password);
    if ('error' in result) return result.error;
    sessionRef.current = result.session;
    setSession(result.session);
    await saveSession(result.session);
    return null;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, loading, signIn, signOut }),
    [session, loading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

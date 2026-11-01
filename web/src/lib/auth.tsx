import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, session, type User } from './api';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Mirrors the stored token in React state, so signing out (or an expired token) re-renders
  // immediately and protected screens disappear instead of lingering until the next click.
  const [token, setToken] = useState(session.token);
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: async () => (await api.me()).data,
    enabled: Boolean(token),
    retry: false,
    staleTime: 30_000,
  });

  const signOut = useCallback(() => {
    session.set(null);
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => session.onUnauthorized(signOut), [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data } = await api.login(email, password);
    session.set(data.accessToken);
    setToken(data.accessToken);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: token ? (me.data ?? null) : null,
      loading: Boolean(token) && me.isPending,
      signIn,
      signOut,
    }),
    [token, me.data, me.isPending, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

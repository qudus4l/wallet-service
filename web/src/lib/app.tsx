import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router';
import { api, session, type User } from './api';

/**
 * App-wide state, mirroring the design's globals: the signed-in user, the "busy" guard that
 * blocks navigation mid-action, the toast, the single <dialog>, and sign-out with a message.
 */

export interface ModalContent {
  title: ReactNode;
  sub: ReactNode;
  body: ReactNode;
}

interface AppState {
  user: User | null;
  booting: boolean;
  authMessage: string | null;
  setAuthMessage: (message: string | null) => void;
  signIn: (email: string, password: string) => Promise<User>;
  /** Sign out; `force` skips the busy guard (expired session, blocked account). */
  signOut: (message?: string, force?: boolean) => void;
  /** Path a signed-out admin was on, to return them there (design: savedPage). */
  savedPath: string;
  busy: { current: boolean };
  testRunning: { current: boolean };
  /** True (and toasts) when an action is in flight, so navigation must wait. */
  blockedByWork: () => boolean;
  go: (path: string) => void;
  /** Bumped by go('/send') so the send flow starts over, as in the design. */
  sendFlow: number;
  toast: (message: string) => void;
  toastText: string | null;
  modal: ModalContent | null;
  openModal: (title: ReactNode, sub: ReactNode, body: ReactNode) => void;
  closeModal: () => void;
  /** Admin user search, kept across page visits like the design's userQuery. */
  userQuery: string;
  setUserQuery: (q: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(Boolean(session.token));
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalContent | null>(null);
  const [sendFlow, setSendFlow] = useState(0);
  const [userQuery, setUserQuery] = useState('');
  const [savedPath, setSavedPath] = useState('/');
  const busy = useRef(false);
  const testRunning = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const waking = useRef(false);

  const toast = useCallback((message: string) => {
    setToastText(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      if (!waking.current) setToastText(null);
    }, 3500);
  }, []);

  const blockedByWork = useCallback(() => {
    if (busy.current || testRunning.current) {
      toast('Please wait for the current action to finish.');
      return true;
    }
    return false;
  }, [toast]);

  const closeModal = useCallback(() => {
    if (busy.current) return;
    setModal(null);
  }, []);

  const openModal = useCallback((title: ReactNode, sub: ReactNode, body: ReactNode) => {
    setModal({ title, sub, body });
  }, []);

  const signOut = useCallback(
    (message?: string, force = false) => {
      if (!force && blockedByWork()) return;
      busy.current = false;
      testRunning.current = false;
      setSavedPath(window.location.pathname);
      session.set(null);
      setUser(null);
      setModal(null);
      setAuthMessage(message ?? null);
      queryClient.clear();
    },
    [blockedByWork, queryClient],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { data } = await api.login(email, password);
    session.set(data.accessToken);
    try {
      const me = (await api.me()).data;
      setUser(me);
      return me;
    } catch (error) {
      session.set(null);
      throw error;
    }
  }, []);

  const go = useCallback(
    (path: string) => {
      if (blockedByWork()) return;
      if (path === '/send') setSendFlow((n) => n + 1);
      navigate(path);
      window.scrollTo(0, 0);
    },
    [blockedByWork, navigate],
  );

  // Session-wide reactions to the API: expired token, blocked account, cold-starting server.
  useEffect(() => {
    session.on({
      unauthorized: () => signOut('Your session has expired. Sign in again.', true),
      blocked: () => signOut('This account is blocked.', true),
      slow: (slow) => {
        waking.current = slow;
        if (slow) {
          clearTimeout(toastTimer.current);
          setToastText('Waking up the server… this can take up to a minute.');
        } else setToastText(null);
      },
    });
  }, [signOut]);

  // Restore a session kept in sessionStorage (page refresh).
  useEffect(() => {
    if (!session.token) return;
    api
      .me()
      .then(({ data }) => setUser(data))
      .catch(() => session.set(null))
      .finally(() => setBooting(false));
  }, []);

  const value = useMemo<AppState>(
    () => ({
      user,
      booting,
      authMessage,
      setAuthMessage,
      signIn,
      signOut,
      savedPath,
      busy,
      testRunning,
      blockedByWork,
      go,
      sendFlow,
      toast,
      toastText,
      modal,
      openModal,
      closeModal,
      userQuery,
      setUserQuery,
    }),
    [
      user,
      booting,
      authMessage,
      signIn,
      signOut,
      savedPath,
      blockedByWork,
      go,
      sendFlow,
      toast,
      toastText,
      modal,
      openModal,
      closeModal,
      userQuery,
    ],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

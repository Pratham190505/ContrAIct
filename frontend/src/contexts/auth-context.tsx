import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getMe, login, logout, signup, type AuthUser, type LoginPayload, type SignupPayload } from "@/api/auth";
import { clearStoredToken, getStoredToken, setStoredToken } from "@/lib/auth-storage";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (payload: LoginPayload) => Promise<AuthUser>;
  signUp: (payload: SignupPayload) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(getStoredToken()));

  const persistSession = useCallback((nextToken: string, nextUser: AuthUser) => {
    setStoredToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const storedToken = getStoredToken();
    if (!storedToken) {
      clearSession();
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    try {
      const currentUser = await getMe();
      setToken(storedToken);
      setUser(currentUser);
      return currentUser;
    } catch {
      clearSession();
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const signIn = useCallback(
    async (payload: LoginPayload) => {
      const result = await login(payload);
      persistSession(result.token, result.user);
      return result.user;
    },
    [persistSession],
  );

  const signUp = useCallback(
    async (payload: SignupPayload) => {
      const result = await signup(payload);
      persistSession(result.token, result.user);
      return result.user;
    },
    [persistSession],
  );

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      isLoading,
      signIn,
      signUp,
      signOut,
      refreshUser,
    }),
    [isLoading, refreshUser, signIn, signOut, signUp, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

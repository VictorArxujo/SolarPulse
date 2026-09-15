import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from '../api/client';

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getToken());

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: !!token,
      login: async (email, senha) => {
        const accessToken = await api.login(email, senha);
        setToken(accessToken);
        setTokenState(accessToken);
      },
      logout: () => {
        setToken(null);
        setTokenState(null);
      },
    }),
    [token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
}

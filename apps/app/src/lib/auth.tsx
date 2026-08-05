import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, loadTokens, saveTokens } from './api';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  defaultCurrency: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  register(input: { email: string; password: string; displayName: string; defaultCurrency: string }): Promise<void>;
  signOut(): Promise<void>;
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      setUser(await api<AuthUser>('/me'));
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    void (async () => {
      await loadTokens();
      await refreshUser();
      setLoading(false);
    })();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    signIn: async (email, password) => {
      const result = await api<{ user: AuthUser; accessToken: string; refreshToken: string }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      await saveTokens(result);
      setUser(result.user);
    },
    register: async (input) => {
      const result = await api<{ user: AuthUser; accessToken: string; refreshToken: string }>('/auth/register', {
        method: 'POST', body: JSON.stringify(input),
      });
      await saveTokens(result);
      setUser(result.user);
    },
    signOut: async () => {
      await saveTokens(null);
      setUser(null);
    },
    refreshUser,
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

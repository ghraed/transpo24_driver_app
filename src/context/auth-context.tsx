import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { login, registerDriver } from '@/lib/api';
import { clearAccessToken, persistAccessToken, readAccessToken } from '@/lib/auth-storage';
import type {
  AuthUser,
  DriverAuthResponse,
  DriverNextStep,
  DriverProfile,
  LoginPayload,
  RegisterDriverPayload,
} from '@/types/auth';

interface AuthContextValue {
  accessToken: string | null;
  user: AuthUser | null;
  driver: DriverProfile | null;
  isAuthenticated: boolean;
  isRestoringSession: boolean;
  signIn: (payload: LoginPayload) => Promise<DriverNextStep>;
  signOut: () => Promise<void>;
  registerNewDriver: (payload: RegisterDriverPayload) => Promise<DriverAuthResponse>;
  restoreSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);

  const restoreSession = useCallback(async (): Promise<void> => {
    setIsRestoringSession(true);
    try {
      const token = await readAccessToken();
      setAccessToken(token);
    } finally {
      setIsRestoringSession(false);
    }
  }, []);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const registerNewDriver = useCallback(async (payload: RegisterDriverPayload) => {
    const response = await registerDriver(payload);
    await persistAccessToken(response.accessToken);
    setAccessToken(response.accessToken);
    setUser(response.user);
    setDriver(response.driver);
    return response;
  }, []);

  const signIn = useCallback(async (payload: LoginPayload): Promise<DriverNextStep> => {
    const response = await login(payload);

    await persistAccessToken(response.accessToken);
    setAccessToken(response.accessToken);
    setUser(response.user);
    setDriver(response.driver ?? null);

    if (response.nextStep) {
      return response.nextStep;
    }

    return response.user.role === 'DRIVER' ? 'COMPLETE_PROFILE' : 'HOME';
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await clearAccessToken();
    setAccessToken(null);
    setUser(null);
    setDriver(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      user,
      driver,
      isAuthenticated: Boolean(accessToken),
      isRestoringSession,
      signIn,
      signOut,
      registerNewDriver,
      restoreSession,
    }),
    [accessToken, driver, isRestoringSession, registerNewDriver, restoreSession, signIn, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
}

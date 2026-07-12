import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  getDriverAvailability,
  getDriverMe,
  loginDriver,
  registerDriver,
  updateDriverAvailability,
  updateDriverProfile,
} from '@/lib/api';
import {
  clearAccessToken,
  clearDriverOnboardingDrafts,
  persistAccessToken,
  readAccessToken,
} from '@/lib/auth-storage';
import type {
  AuthUser,
  DriverAvailabilityResponse,
  DriverAuthResponse,
  DriverMeResponse,
  DriverNextStep,
  DriverProfile,
  LoginPayload,
  RegisterDriverPayload,
  UpdateDriverAvailabilityPayload,
  UpdateDriverProfilePayload,
} from '@/types/auth';

interface AuthContextValue {
  accessToken: string | null;
  user: AuthUser | null;
  driver: DriverProfile | null;
  isAuthenticated: boolean;
  isRestoringSession: boolean;
  hasRestoredStoredSession: boolean;
  signIn: (payload: LoginPayload) => Promise<DriverNextStep>;
  signOut: () => Promise<void>;
  registerNewDriver: (payload: RegisterDriverPayload) => Promise<DriverAuthResponse>;
  restoreSession: () => Promise<void>;
  refreshDriverMe: () => Promise<DriverMeResponse>;
  saveDriverProfile: (payload: UpdateDriverProfilePayload) => Promise<DriverMeResponse>;
  refreshDriverAvailability: () => Promise<DriverAvailabilityResponse>;
  saveDriverAvailability: (
    payload: UpdateDriverAvailabilityPayload,
  ) => Promise<DriverAvailabilityResponse>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);
  const [hasRestoredStoredSession, setHasRestoredStoredSession] = useState<boolean>(false);

  const applyDriverMeResponse = useCallback((response: DriverMeResponse): void => {
    setUser(response.user);
    setDriver(response.driver);
  }, []);

  const restoreSession = useCallback(async (): Promise<void> => {
    setIsRestoringSession(true);
    try {
      const token = await readAccessToken();
      setHasRestoredStoredSession(Boolean(token));
      setAccessToken(token);

      if (token) {
        try {
          const me = await getDriverMe();
          applyDriverMeResponse(me);
        } catch {
          await clearAccessToken();
          await clearDriverOnboardingDrafts();
          setAccessToken(null);
          setUser(null);
          setDriver(null);
        }
      }
    } finally {
      setIsRestoringSession(false);
    }
  }, [applyDriverMeResponse]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const registerNewDriver = useCallback(async (payload: RegisterDriverPayload) => {
    const response = await registerDriver(payload);
    await persistAccessToken(response.accessToken);
    await clearDriverOnboardingDrafts();
    setHasRestoredStoredSession(false);
    setAccessToken(response.accessToken);
    setUser(response.user);
    setDriver(response.driver);
    return response;
  }, []);

  const signIn = useCallback(async (payload: LoginPayload): Promise<DriverNextStep> => {
    const response = await loginDriver(payload);

    await persistAccessToken(response.accessToken);
    await clearDriverOnboardingDrafts();
    setHasRestoredStoredSession(false);
    setAccessToken(response.accessToken);
    setUser(response.user);
    setDriver(response.driver ?? null);

    if (response.nextStep) {
      return response.nextStep;
    }

    return response.user.role === 'DRIVER' ? 'COMPLETE_PROFILE' : 'HOME';
  }, []);

  const refreshDriverMe = useCallback(async (): Promise<DriverMeResponse> => {
    const me = await getDriverMe();
    applyDriverMeResponse(me);
    return me;
  }, [applyDriverMeResponse]);

  const saveDriverProfile = useCallback(async (payload: UpdateDriverProfilePayload): Promise<DriverMeResponse> => {
    const updated = await updateDriverProfile(payload);
    applyDriverMeResponse(updated);
    return updated;
  }, [applyDriverMeResponse]);

  const refreshDriverAvailability = useCallback(async (): Promise<DriverAvailabilityResponse> => {
    return getDriverAvailability();
  }, []);

  const saveDriverAvailability = useCallback(
    async (payload: UpdateDriverAvailabilityPayload): Promise<DriverAvailabilityResponse> => {
      return updateDriverAvailability(payload);
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await clearAccessToken();
    await clearDriverOnboardingDrafts();
    setHasRestoredStoredSession(false);
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
      hasRestoredStoredSession,
      signIn,
      signOut,
      registerNewDriver,
      restoreSession,
      refreshDriverMe,
      saveDriverProfile,
      refreshDriverAvailability,
      saveDriverAvailability,
    }),
    [
      accessToken,
      driver,
      hasRestoredStoredSession,
      isRestoringSession,
      refreshDriverMe,
      refreshDriverAvailability,
      registerNewDriver,
      restoreSession,
      saveDriverProfile,
      saveDriverAvailability,
      signIn,
      signOut,
      user,
    ],
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

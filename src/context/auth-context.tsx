import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  getDriverAvailability,
  getDriverMe,
  continueDriverTrustedSession,
  updateDriverAvailability,
  updateDriverProfile,
  verifyDriverPhoneVerificationCode,
} from '@/lib/api';
import {
  clearAccessToken,
  clearDriverOnboardingDrafts,
  clearTrustedDriverSession,
  persistAccessToken,
  persistTrustedDriverSession,
  readAccessToken,
  readTrustedDriverSession,
} from '@/lib/auth-storage';
import type {
  AuthUser,
  DriverAvailabilityResponse,
  DriverMeResponse,
  DriverNextStep,
  DriverProfile,
  UpdateDriverAvailabilityPayload,
  UpdateDriverProfilePayload,
  VerifyPhoneCodePayload,
} from '@/types/auth';

interface AuthContextValue {
  accessToken: string | null;
  user: AuthUser | null;
  driver: DriverProfile | null;
  isAuthenticated: boolean;
  isRestoringSession: boolean;
  hasRestoredStoredSession: boolean;
  authenticateWithPhone: (payload: VerifyPhoneCodePayload) => Promise<DriverNextStep>;
  continueWithTrustedSession: () => Promise<boolean>;
  signOut: () => Promise<void>;
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
          const trustedSession = await readTrustedDriverSession();
          if (trustedSession) {
            try {
              const renewed = await continueDriverTrustedSession({
                accessToken: trustedSession.accessToken,
              });
              await persistAccessToken(renewed.accessToken);
              await persistTrustedDriverSession({
                accessToken: renewed.accessToken,
                phoneNumber: renewed.driver.phone,
              });
              setAccessToken(renewed.accessToken);
              setUser(renewed.user);
              setDriver(renewed.driver);
              return;
            } catch {
              await clearTrustedDriverSession();
            }
          }
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
    const restoreTimeout = setTimeout(() => {
      void restoreSession();
    }, 0);

    return () => {
      clearTimeout(restoreTimeout);
    };
  }, [restoreSession]);

  const authenticateWithPhone = useCallback(async (
    payload: VerifyPhoneCodePayload,
  ): Promise<DriverNextStep> => {
    const response = await verifyDriverPhoneVerificationCode(payload);

    await Promise.all([
      persistAccessToken(response.accessToken),
      persistTrustedDriverSession({
        accessToken: response.accessToken,
        phoneNumber: response.driver.phone,
      }),
    ]);
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

  const continueWithTrustedSession = useCallback(async (): Promise<boolean> => {
    const trustedSession = await readTrustedDriverSession();
    if (!trustedSession) return false;

    try {
      const renewed = await continueDriverTrustedSession({
        accessToken: trustedSession.accessToken,
      });
      await Promise.all([
        persistAccessToken(renewed.accessToken),
        persistTrustedDriverSession({
          accessToken: renewed.accessToken,
          phoneNumber: renewed.driver.phone,
        }),
      ]);
      setUser(renewed.user);
      setDriver(renewed.driver);
      setHasRestoredStoredSession(true);
      setAccessToken(renewed.accessToken);
      return true;
    } catch {
      await Promise.all([
        clearAccessToken(),
        clearTrustedDriverSession(),
      ]);
      setHasRestoredStoredSession(false);
      setAccessToken(null);
      setUser(null);
      setDriver(null);
      return false;
    }
  }, [applyDriverMeResponse]);

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
      authenticateWithPhone,
      continueWithTrustedSession,
      signOut,
      restoreSession,
      refreshDriverMe,
      saveDriverProfile,
      refreshDriverAvailability,
      saveDriverAvailability,
    }),
    [
      accessToken,
      authenticateWithPhone,
      continueWithTrustedSession,
      driver,
      hasRestoredStoredSession,
      isRestoringSession,
      refreshDriverMe,
      refreshDriverAvailability,
      restoreSession,
      saveDriverProfile,
      saveDriverAvailability,
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

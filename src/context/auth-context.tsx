import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  getDriverAvailability,
  getDriverMe,
  continueDriverTrustedSession,
  deleteDriverAccount,
  updateDriverAvailability,
  updateDriverProfile,
  verifyDriverPhoneVerificationCode,
  isAuthenticationFailure,
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

export type TrustedSessionContinuationResult =
  | { status: 'restored'; nextStep: DriverNextStep }
  | { status: 'invalid' }
  | { status: 'unavailable'; message: string };

interface AuthContextValue {
  accessToken: string | null;
  user: AuthUser | null;
  driver: DriverProfile | null;
  isAuthenticated: boolean;
  isRestoringSession: boolean;
  hasRestoredStoredSession: boolean;
  authenticateWithPhone: (payload: VerifyPhoneCodePayload) => Promise<DriverNextStep>;
  continueWithTrustedSession: () => Promise<TrustedSessionContinuationResult>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
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
            } catch (continuationError) {
              // A timeout or temporarily unreachable backend must never make a
              // remembered device forget its trusted credential. Only the API
              // can tell us conclusively that the credential is no longer valid.
              if (!isAuthenticationFailure(continuationError)) {
                return;
              }
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

  const continueWithTrustedSession = useCallback(async (): Promise<TrustedSessionContinuationResult> => {
    try {
      const trustedSession = await readTrustedDriverSession();
      if (!trustedSession) return { status: 'invalid' };

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
      return { status: 'restored', nextStep: renewed.nextStep };
    } catch (error) {
      if (!isAuthenticationFailure(error)) {
        return {
          status: 'unavailable',
          message: error instanceof Error ? error.message : 'Unable to continue the trusted session.',
        };
      }

      await Promise.all([
        clearAccessToken(),
        clearTrustedDriverSession(),
        clearDriverOnboardingDrafts(),
      ]);
      setHasRestoredStoredSession(false);
      setAccessToken(null);
      setUser(null);
      setDriver(null);
      return { status: 'invalid' };
    }
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
    await Promise.all([
      clearAccessToken(),
      clearTrustedDriverSession(),
      clearDriverOnboardingDrafts(),
    ]);
    setHasRestoredStoredSession(false);
    setAccessToken(null);
    setUser(null);
    setDriver(null);
  }, []);

  const deleteAccount = useCallback(async (): Promise<void> => {
    await deleteDriverAccount();
    await signOut();
  }, [signOut]);

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
      deleteAccount,
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
      deleteAccount,
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

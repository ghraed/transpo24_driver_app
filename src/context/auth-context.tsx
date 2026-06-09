import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  approveDriverForTesting as approveDriverForTestingApi,
  getDriverAvailability,
  getDriverMe,
  getDriverOnboardingStatus,
  loginDriver,
  registerDriver,
  updateDriverAvailability,
  updateDriverPersonalInfo,
  updateDriverProfile,
} from '@/lib/api';
import { normalizeDriverNextStep } from '@/lib/driver-onboarding';
import { clearAccessToken, persistAccessToken, readAccessToken } from '@/lib/auth-storage';
import type {
  AuthUser,
  DriverAvailabilityResponse,
  DriverMeResponse,
  DriverNextStep,
  DriverOnboardingResponse,
  DriverPersonalInfoPayload,
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
  signIn: (payload: LoginPayload) => Promise<DriverNextStep>;
  signOut: () => Promise<void>;
  registerNewDriver: (payload: RegisterDriverPayload) => Promise<DriverNextStep>;
  restoreSession: () => Promise<void>;
  refreshDriverMe: () => Promise<DriverMeResponse>;
  refreshDriverOnboarding: () => Promise<DriverOnboardingResponse>;
  saveDriverProfile: (payload: UpdateDriverProfilePayload) => Promise<DriverMeResponse>;
  saveDriverPersonalInfo: (
    payload: DriverPersonalInfoPayload,
  ) => Promise<DriverOnboardingResponse>;
  refreshDriverAvailability: () => Promise<DriverAvailabilityResponse>;
  saveDriverAvailability: (
    payload: UpdateDriverAvailabilityPayload,
  ) => Promise<DriverAvailabilityResponse>;
  approveDriverForTesting: () => Promise<DriverMeResponse>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);

  const applyDriverMeResponse = useCallback((response: DriverMeResponse): void => {
    setUser(response.user);
    setDriver(response.driver);
  }, []);

  const restoreSession = useCallback(async (): Promise<void> => {
    setIsRestoringSession(true);
    try {
      const token = await readAccessToken();
      setAccessToken(token);

      if (token) {
        try {
          const me = await getDriverMe();
          applyDriverMeResponse(me);
        } catch {
          await clearAccessToken();
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
    const timeoutId = setTimeout(() => {
      void restoreSession();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [restoreSession]);

  const refreshDriverOnboarding = useCallback(async (): Promise<DriverOnboardingResponse> => {
    return getDriverOnboardingStatus();
  }, []);

  const resolvePostAuthNextStep = useCallback(
    async (fallbackStep?: string): Promise<DriverNextStep> => {
      try {
        const onboarding = await getDriverOnboardingStatus();
        const normalizedOnboardingStep = normalizeDriverNextStep(
          onboarding.nextStep,
        );

        if (
          normalizedOnboardingStep === 'COMPLETE_PROFILE' ||
          normalizedOnboardingStep === 'UPLOAD_DOCUMENTS'
        ) {
          return normalizedOnboardingStep;
        }
      } catch {
        if (fallbackStep) {
          return normalizeDriverNextStep(fallbackStep);
        }
      }

      try {
        const me = await getDriverMe();
        applyDriverMeResponse(me);
        return me.nextStep;
      } catch {
        return normalizeDriverNextStep(fallbackStep);
      }
    },
    [applyDriverMeResponse],
  );

  const registerNewDriver = useCallback(async (payload: RegisterDriverPayload) => {
    const response = await registerDriver(payload);
    await persistAccessToken(response.accessToken);
    setAccessToken(response.accessToken);
    setUser(response.user);
    setDriver(null);
    return resolvePostAuthNextStep(response.nextStep);
  }, [resolvePostAuthNextStep]);

  const signIn = useCallback(async (payload: LoginPayload): Promise<DriverNextStep> => {
    const response = await loginDriver(payload);

    await persistAccessToken(response.accessToken);
    setAccessToken(response.accessToken);
    setUser(response.user);
    setDriver(null);

    return resolvePostAuthNextStep(response.nextStep);
  }, [resolvePostAuthNextStep]);

  const refreshDriverMe = useCallback(async (): Promise<DriverMeResponse> => {
    const me = await getDriverMe();
    applyDriverMeResponse(me);
    return me;
  }, [applyDriverMeResponse]);

  const saveDriverPersonalInfo = useCallback(
    async (payload: DriverPersonalInfoPayload): Promise<DriverOnboardingResponse> => {
      const updated = await updateDriverPersonalInfo(payload);
      try {
        const me = await getDriverMe();
        applyDriverMeResponse(me);
      } catch {
        // Keep the onboarding response even if the broader profile refresh fails.
      }
      return updated;
    },
    [applyDriverMeResponse],
  );

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

  const approveDriverForTesting = useCallback(async (): Promise<DriverMeResponse> => {
    const response = await approveDriverForTestingApi();
    applyDriverMeResponse(response);
    return response;
  }, [applyDriverMeResponse]);

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
      refreshDriverMe,
      refreshDriverOnboarding,
      saveDriverPersonalInfo,
      saveDriverProfile,
      refreshDriverAvailability,
      saveDriverAvailability,
      approveDriverForTesting,
    }),
    [
      accessToken,
      driver,
      isRestoringSession,
      refreshDriverMe,
      refreshDriverAvailability,
      registerNewDriver,
      restoreSession,
      saveDriverProfile,
      refreshDriverOnboarding,
      saveDriverPersonalInfo,
      saveDriverAvailability,
      approveDriverForTesting,
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

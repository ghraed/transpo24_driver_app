import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, useRouter, type Href } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { LocalizationProvider, useAppLanguage } from '@/localization/provider';
import {
  clearLastOnboardingRoute,
  readLastOnboardingRoute,
} from '@/lib/auth-storage';
import { resolveDriverEntryRoute } from '@/lib/onboarding-route';
import { initializeNotifications, registerDriverPushNotifications } from '@/notifications/registerPushNotifications';
import { useNotificationNavigation } from '@/notifications/useNotificationNavigation';

function AppNavigator() {
  const {
    accessToken,
    isRestoringSession,
    hasRestoredStoredSession,
    refreshDriverMe,
    signOut,
  } = useAuth();
  const { ready: localizationReady } = useAppLanguage();
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const hasResolvedInitialRouteRef = useRef(false);
  const lastRegisteredAccessTokenRef = useRef<string | null>(null);

  useNotificationNavigation();

  useEffect(() => {
    if (isRestoringSession) return;

    if (!accessToken) {
      hasResolvedInitialRouteRef.current = false;
      return;
    }

    if (!hasRestoredStoredSession) {
      hasResolvedInitialRouteRef.current = true;
      return;
    }

    if (pathname !== '/' && pathname !== '/register') {
      hasResolvedInitialRouteRef.current = true;
      return;
    }

    if (hasResolvedInitialRouteRef.current) return;
    hasResolvedInitialRouteRef.current = true;

    const resolveEntryRoute = async (): Promise<void> => {
      try {
        const response = await refreshDriverMe();
        const savedRoute = await readLastOnboardingRoute();
        const targetRoute = resolveDriverEntryRoute(response.nextStep, savedRoute);

        if (response.nextStep === 'HOME') {
          await clearLastOnboardingRoute();
        }

        router.replace(targetRoute as Href);
      } catch {
        await signOut();
        router.replace('/');
      }
    };

    void resolveEntryRoute();
  }, [
    accessToken,
    hasRestoredStoredSession,
    isRestoringSession,
    pathname,
    refreshDriverMe,
    router,
    signOut,
  ]);

  useEffect(() => {
    initializeNotifications();
  }, []);

  useEffect(() => {
    if (isRestoringSession) {
      return;
    }

    if (!accessToken) {
      lastRegisteredAccessTokenRef.current = null;
      return;
    }

    if (lastRegisteredAccessTokenRef.current === accessToken) {
      return;
    }

    lastRegisteredAccessTokenRef.current = accessToken;
    void registerDriverPushNotifications().catch((error: unknown) => {
      console.warn('Driver push registration failed.', error);
      lastRegisteredAccessTokenRef.current = null;
    });
  }, [accessToken, isRestoringSession]);

  if (isRestoringSession || !localizationReady) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t('Driver Login') }} />
      <Stack.Screen name="register" options={{ title: t('Driver Registration') }} />
      <Stack.Screen name="complete-profile" options={{ title: t('Complete Profile') }} />
      <Stack.Screen name="vehicle-documents" options={{ title: t('Driver Documents') }} />
      <Stack.Screen name="vehicle-information" options={{ title: t('Vehicle Information') }} />
      <Stack.Screen name="my-vehicles" options={{ title: t('My Vehicles') }} />
      <Stack.Screen name="manage-load-capacities" options={{ title: t('Manage Load Capacities') }} />
      <Stack.Screen name="load-capacity" options={{ title: t('Define Load Capacity') }} />
      <Stack.Screen name="set-availability" options={{ title: t('Set Availability') }} />
      <Stack.Screen name="waiting-approval" options={{ title: t('Waiting Approval') }} />
      <Stack.Screen name="driver-home" options={{ title: t('Driver Home') }} />
      <Stack.Screen name="receive-requests" options={{ title: t('Available Requests') }} />
      <Stack.Screen name="accepted-jobs" options={{ title: t('Accepted Jobs') }} />
      <Stack.Screen name="chat" options={{ title: t('Chat with Client') }} />
      <Stack.Screen name="accepted-job-details" options={{ title: t('Accepted Job Details') }} />
      <Stack.Screen name="go-to-pickup" options={{ title: t('Go to Pickup Location') }} />
      <Stack.Screen name="pickup-item" options={{ title: t('Pickup Item') }} />
      <Stack.Screen name="deliver-item" options={{ title: t('Deliver Item') }} />
      <Stack.Screen name="trip-expenses" options={{ title: t('Additional Expenses') }} />
      <Stack.Screen name="driver-trip-completed" options={{ title: t('Trip Completed') }} />
      <Stack.Screen name="socket-debug" options={{ title: t('Socket Debug') }} />
      <Stack.Screen name="review-request-details" options={{ title: t('Request Details') }} />
      <Stack.Screen name="send-price-offer" options={{ title: t('Send Price Offer') }} />
      <Stack.Screen
        name="offer-waiting-response"
        options={{ title: t('Waiting for Customer Response') }}
      />
      <Stack.Screen name="explore" options={{ title: t('Explore') }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <LocalizationProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
});

import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, useRouter, type Href } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/context/auth-context';
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

  if (isRestoringSession) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Driver Login' }} />
      <Stack.Screen name="register" options={{ title: 'Driver Registration' }} />
      <Stack.Screen name="complete-profile" options={{ title: 'Complete Profile' }} />
      <Stack.Screen name="vehicle-documents" options={{ title: 'Driver Documents' }} />
      <Stack.Screen name="vehicle-information" options={{ title: 'Vehicle Information' }} />
      <Stack.Screen name="my-vehicles" options={{ title: 'My Vehicles' }} />
      <Stack.Screen name="manage-load-capacities" options={{ title: 'Manage Load Capacities' }} />
      <Stack.Screen name="load-capacity" options={{ title: 'Define Load Capacity' }} />
      <Stack.Screen name="set-availability" options={{ title: 'Set Availability' }} />
      <Stack.Screen name="waiting-approval" options={{ title: 'Waiting Approval' }} />
      <Stack.Screen name="driver-home" options={{ title: 'Driver Home' }} />
      <Stack.Screen name="receive-requests" options={{ title: 'Available Requests' }} />
      <Stack.Screen name="accepted-jobs" options={{ title: 'Accepted Jobs' }} />
      <Stack.Screen name="chat" options={{ title: 'Chat with Client' }} />
      <Stack.Screen
        name="accepted-job-details"
        options={{ title: 'Accepted Job Details' }}
      />
      <Stack.Screen name="go-to-pickup" options={{ title: 'Go to Pickup Location' }} />
      <Stack.Screen name="pickup-item" options={{ title: 'Pickup Item' }} />
      <Stack.Screen name="deliver-item" options={{ title: 'Deliver Item' }} />
      <Stack.Screen name="trip-expenses" options={{ title: 'Additional Expenses' }} />
      <Stack.Screen name="driver-trip-completed" options={{ title: 'Trip Completed' }} />
      <Stack.Screen name="socket-debug" options={{ title: 'Socket Debug' }} />
      <Stack.Screen name="review-request-details" options={{ title: 'Request Details' }} />
      <Stack.Screen name="send-price-offer" options={{ title: 'Send Price Offer' }} />
      <Stack.Screen
        name="offer-waiting-response"
        options={{ title: 'Waiting for Customer Response' }}
      />
      <Stack.Screen name="explore" options={{ title: 'Explore' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
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

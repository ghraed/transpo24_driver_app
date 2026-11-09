import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { registerDriverPushNotifications } from './registerPushNotifications';
import { PushConfigurationError } from './push-registration-error';

export function usePushRegistration(sessionKey: string | null): void {
  useEffect(() => {
    if (!sessionKey || Platform.OS === 'web') return;
    let disposed = false;
    let inFlight = false;
    let configurationBlocked = false;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const register = async (requestPermission = false): Promise<void> => {
      if (disposed || inFlight || configurationBlocked) return;
      clearTimeout(retryTimer);
      inFlight = true;
      try {
        await registerDriverPushNotifications(requestPermission);
        retryCount = 0;
      } catch (error) {
        if (error instanceof PushConfigurationError) {
          configurationBlocked = true;
          console.warn(error.message);
          return;
        }
        console.warn('Push registration failed; will retry.', error);
        if (!disposed) {
          // Keep trying while signed in: a temporary outage must not leave this
          // device without a token until the driver opens the app again.
          const retryDelay = Math.min(5000 * 2 ** Math.min(retryCount++, 6), 300000);
          retryTimer = setTimeout(() => { void register(); }, retryDelay);
        }
      } finally {
        inFlight = false;
      }
    };

    void register(true);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        retryCount = 0;
        void register();
      }
    });
    // Native token rotation requires fetching and uploading a fresh Expo token.
    const tokenSubscription = Notifications.addPushTokenListener(() => { void register(); });
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [sessionKey]);
}

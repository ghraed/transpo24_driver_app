import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { requireOptionalNativeModule } from 'expo';
import { Alert, AppState, Platform } from 'react-native';
import { io } from 'socket.io-client';

import { getBackendSocketUrl } from '@/config/backend';
import { ApiResponseError, getDriverAcceptedJobDetails } from '@/lib/api';
import { readAccessToken } from '@/lib/auth-storage';
import i18n from '@/localization/i18n';

export const BACKGROUND_TRIP_TASK = 'transpo24.driver.active-trip-location';
// Old binaries and web retain foreground functionality until a native rebuild.
const TaskManager: typeof import('expo-task-manager') | null =
  Platform.OS !== 'web' && requireOptionalNativeModule('ExpoTaskManager')
    // Conditional loading preserves compatibility with installed binaries without this native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ? require('expo-task-manager')
    : null;
let foregroundUpdate: { tripId: string; at: number } | undefined;
export function noteForegroundTripLocation(tripId: string): void {
  foregroundUpdate = { tripId, at: Date.now() };
}

const TRIP_KEY = 'transpo24.driver.backgroundTrip';
const PROMPT_KEY = 'transpo24.driver.backgroundTripPrompt';
const MOVING_STATUSES = new Set(['DRIVER_GOING_TO_PICKUP', 'DRIVER_GOING_TO_DROPOFF']);
let generation = 0;
let mutations: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutations.then(operation, operation);
  mutations = next.catch(() => undefined);
  return next;
}

export async function stopBackgroundTripTracking(expectedTripId?: string): Promise<void> {
  if (Platform.OS === 'web' || !TaskManager) return;
  if (!expectedTripId) generation += 1;
  await serialize(async () => {
    const tripId = await SecureStore.getItemAsync(TRIP_KEY);
    if (expectedTripId && tripId !== expectedTripId) return;
    // Clear the delivery context first, so a late callback cannot publish it.
    await SecureStore.deleteItemAsync(TRIP_KEY);
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TRIP_TASK)) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TRIP_TASK);
    }
  });
}

async function explainBackgroundPermission(): Promise<boolean> {
  return new Promise((resolve) => Alert.alert(
    i18n.t('Location during your trip'),
    i18n.t('Transpo24 shares your location with the customer during an active pickup or delivery, including when the app is minimized or the screen is locked. Enable background location in the next system screen.'),
    [
      { text: i18n.t('Not now'), style: 'cancel', onPress: () => resolve(false) },
      { text: i18n.t('Continue'), onPress: () => resolve(true) },
    ],
    { cancelable: true, onDismiss: () => resolve(false) },
  ));
}

export async function startBackgroundTripTracking(
  tripId: string,
  isActive: () => boolean = () => true,
): Promise<boolean> {
  if (!TaskManager || !(await TaskManager.isAvailableAsync())) return false;
  const startedGeneration = generation;
  const token = await readAccessToken();
  if (!token || !isActive()) return false;
  if (!(await Location.getForegroundPermissionsAsync()).granted) return false;
  const details = await getDriverAcceptedJobDetails(tripId);
  if (!MOVING_STATUSES.has(details.requestStatus) || !isActive()) return false;

  let permission = await Location.getBackgroundPermissionsAsync();
  if (!permission.granted) {
    // One explanation per trip; revisiting a screen must not repeatedly prompt.
    if (await SecureStore.getItemAsync(PROMPT_KEY) === tripId) return false;
    await SecureStore.setItemAsync(PROMPT_KEY, tripId);
    if (!permission.canAskAgain || !(await explainBackgroundPermission()) || !isActive()) return false;
    permission = await Location.requestBackgroundPermissionsAsync();
  }
  if (!permission.granted || !isActive()) return false;

  return serialize(async () => {
    if (startedGeneration !== generation || !isActive() || token !== await readAccessToken()) return false;
    // Recheck after the user returns from OS settings: the trip may have ended.
    const current = await getDriverAcceptedJobDetails(tripId);
    if (!MOVING_STATUSES.has(current.requestStatus) || !isActive()) return false;
    await SecureStore.setItemAsync(TRIP_KEY, tripId);
    try {
      await Location.startLocationUpdatesAsync(BACKGROUND_TRIP_TASK, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 20,
        timeInterval: 10000,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: i18n.t('Delivery location is active'),
          notificationBody: i18n.t('Your location is shared with the customer during this trip.'),
          killServiceOnDestroy: true,
        },
      });
      return true;
    } catch (error) {
      await SecureStore.deleteItemAsync(TRIP_KEY);
      throw error;
    }
  });
}

async function sendBackgroundLocation(token: string, payload: Record<string, unknown>): Promise<void> {
  // A short-lived connection does not depend on the foreground screen's socket.
  const socket = io(getBackendSocketUrl(), {
    transports: ['websocket'], auth: { token }, autoConnect: false,
    forceNew: true, reconnection: false, timeout: 8000,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Background location timed out')), 10000);
      const finish = (error?: unknown) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      socket.once('connect_error', finish);
      socket.once('exception', finish);
      socket.once('connect', () => {
        socket.timeout(8000).emit('driverLocationUpdate', payload, (error: Error | null, result?: { ok?: boolean }) => {
          finish(error ?? (result?.ok ? undefined : new Error('Location was not acknowledged')));
        });
      });
      socket.connect();
    });
  } finally {
    socket.removeAllListeners();
    socket.disconnect();
  }
}

export async function handleBackgroundLocations(locations: Location.LocationObject[]): Promise<void> {
  const tripId = await SecureStore.getItemAsync(TRIP_KEY);
  const token = await readAccessToken();
  if (!tripId || !token) {
    await stopBackgroundTripTracking(tripId ?? undefined);
    return;
  }
  try {
    const details = await getDriverAcceptedJobDetails(tripId);
    if (!MOVING_STATUSES.has(details.requestStatus)) {
      await stopBackgroundTripTracking(tripId);
      return;
    }
    // Existing foreground watchers continue to update the map and customer.
    if (AppState.currentState === 'active' && foregroundUpdate?.tripId === tripId && Date.now() - foregroundUpdate.at < 15000) return;
    const latest = locations.reduce<Location.LocationObject | undefined>((best, location) =>
      !best || location.timestamp > best.timestamp ? location : best, undefined);
    if (!latest || Date.now() - latest.timestamp > 120000 || latest.timestamp > Date.now() + 10000) return;
    const { latitude, longitude, heading, speed, accuracy } = latest.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
    if (await SecureStore.getItemAsync(TRIP_KEY) !== tripId || await readAccessToken() !== token) return;
    await sendBackgroundLocation(token, {
      tripId, latitude, longitude,
      ...(heading !== null && Number.isFinite(heading) && heading >= 0 ? { heading } : {}),
      ...(speed !== null && Number.isFinite(speed) && speed >= 0 ? { speed } : {}),
      ...(accuracy !== null && Number.isFinite(accuracy) && accuracy >= 0 ? { accuracy } : {}),
    });
  } catch (error) {
    if (error instanceof ApiResponseError && [401, 403, 404].includes(error.status)) {
      await stopBackgroundTripTracking(tripId);
    }
    // Transient offline failures must not sign out the driver or change trip state.
    // No historical location queue is retained; a later update sends a fresh point.
  }
}

if (TaskManager && !TaskManager.isTaskDefined(BACKGROUND_TRIP_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(BACKGROUND_TRIP_TASK, async ({ data, error }) => {
    if (error || !data?.locations) return;
    await handleBackgroundLocations(data.locations).catch(() => undefined);
  });
}

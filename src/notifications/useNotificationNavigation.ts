import { useRouter, useRootNavigationState, usePathname, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import type { PushNotificationData } from '@/notifications/types';

function toPushNotificationData(data: Notifications.NotificationContentInput['data'] | undefined): PushNotificationData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }

  return data as PushNotificationData;
}

function resolveTripId(data: PushNotificationData): string | null {
  if (typeof data.tripId === 'string' && data.tripId.trim()) {
    return data.tripId;
  }

  if (typeof data.requestId === 'string' && data.requestId.trim()) {
    return data.requestId;
  }

  if (typeof data.transportRequestId === 'string' && data.transportRequestId.trim()) {
    return data.transportRequestId;
  }

  return null;
}

function resolveNotificationRoute(data: PushNotificationData): Href | null {
  switch (data.type) {
    case 'NEW_TRANSPORT_REQUEST':
      if (typeof data.requestId === 'string' && data.requestId.trim()) {
        return {
          pathname: '/review-request-details',
          params: { requestId: data.requestId },
        };
      }
      return null;
    case 'DRIVER_SELECTED': {
      const requestId = resolveTripId(data);
      return requestId
        ? {
            pathname: '/accepted-job-details',
            params: { requestId },
          }
        : null;
    }
    case 'CHAT_MESSAGE':
      if (typeof data.chatRoomId === 'string' && data.chatRoomId.trim()) {
        return {
          pathname: '/chat',
          params: {
            chatRoomId: data.chatRoomId,
            transportRequestId:
              typeof data.transportRequestId === 'string' ? data.transportRequestId : '',
          },
        } as unknown as Href;
      }
      return null;
    case 'TRIP_FUNDS_TRANSFERRED':
    case 'ITEM_DELIVERED':
    case 'ADDITIONAL_CHARGE_APPROVED':
    case 'TRIP_COMPLETED':
    case 'CLIENT_PAYMENT_COMPLETED':
    case 'PAYMENT_COMPLETED': {
      const tripId = resolveTripId(data);
      if (tripId) {
        return {
          pathname:
            data.type === 'ADDITIONAL_CHARGE_APPROVED'
              ? '/accepted-job-details'
              : '/driver-trip-completed',
          params:
            data.type === 'ADDITIONAL_CHARGE_APPROVED'
              ? { requestId: tripId }
              : { tripId },
        } as unknown as Href;
      }
      return null;
    }
    default:
      return null;
  }
}

// Keep the response pending while startup/login redirects settle. Expo also retains
// the response when a notification launches a terminated app.
export function useNotificationNavigation(ready: boolean): void {
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const pathname = usePathname();
  const response = Notifications.useLastNotificationResponse();
  const lastHandledIdentifierRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !navigationState?.key || !response) return;
    if (['/', '/register', '/verify-phone', '/complete-profile'].includes(pathname)) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const identifier = response.notification.request.identifier;
    if (lastHandledIdentifierRef.current === identifier) return;

    const route = resolveNotificationRoute(
      toPushNotificationData(response.notification.request.content.data),
    ) ?? '/driver-home';

    router.push(route);
    lastHandledIdentifierRef.current = identifier;
    Notifications.clearLastNotificationResponse();
  }, [ready, navigationState?.key, pathname, response, router]);
}

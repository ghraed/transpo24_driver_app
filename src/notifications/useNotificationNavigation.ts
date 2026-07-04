import { useRouter, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import type { PushNotificationData } from '@/notifications/types';

function toPushNotificationData(data: Notifications.NotificationContentInput['data'] | undefined): PushNotificationData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }

  return data as PushNotificationData;
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
    default:
      return null;
  }
}

export function useNotificationNavigation(): void {
  const router = useRouter();
  const lastHandledIdentifierRef = useRef<string | null>(null);

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse): void => {
      const identifier = response.notification.request.identifier;
      if (lastHandledIdentifierRef.current === identifier) {
        return;
      }

      const route = resolveNotificationRoute(
        toPushNotificationData(response.notification.request.content.data),
      );

      if (!route) {
        return;
      }

      lastHandledIdentifierRef.current = identifier;
      router.push(route);
    };

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          handleResponse(response);
        }
      })
      .catch((error: unknown) => {
        console.warn('Failed to inspect the last notification response.', error);
      });

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

    return () => {
      subscription.remove();
    };
  }, [router]);
}

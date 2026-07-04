export type MobileAppContext = 'DRIVER';

export type PushNotificationType =
  | 'NEW_TRANSPORT_REQUEST'
  | 'NEW_DRIVER_OFFER'
  | string;

export interface RegisterPushTokenPayload {
  token: string;
  platform: 'ios' | 'android';
  app: MobileAppContext;
  deviceName?: string;
}

export interface PushNotificationData {
  type?: PushNotificationType;
  requestId?: string;
  offerId?: string;
  [key: string]: unknown;
}

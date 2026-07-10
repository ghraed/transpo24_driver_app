export type MobileAppContext = 'DRIVER';

export type PushNotificationType =
  | 'NEW_TRANSPORT_REQUEST'
  | 'NEW_DRIVER_OFFER'
  | 'CHAT_MESSAGE'
  | 'ITEM_PICKED_UP'
  | 'ITEM_DELIVERED'
  | 'TRIP_COMPLETED'
  | 'CLIENT_PAYMENT_COMPLETED'
  | 'PAYMENT_COMPLETED'
  | 'TRIP_FUNDS_TRANSFERRED'
  | string;

export interface RegisterPushTokenPayload {
  token: string;
  platform: 'ios' | 'android';
  app: MobileAppContext;
  deviceName?: string;
}

export interface PushNotificationData {
  type?: PushNotificationType;
  tripId?: string;
  requestId?: string;
  offerId?: string;
  chatRoomId?: string;
  transportRequestId?: string;
  [key: string]: unknown;
}

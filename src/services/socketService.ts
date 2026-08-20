import { io, type Socket } from 'socket.io-client';

import { getBackendSocketUrl } from '@/config/backend';
import i18n from '@/localization/i18n';
import { localizeResponseMessage } from '@/localization/response-message';
import type {
  ChatMessage,
  ChatMessageCreatedEventPayload,
  ChatMessageReadEventPayload,
  SendChatMessagePayload,
  SendChatMessageResponse,
} from '@/types/chat';
import type {
  DriverArrivedPickupConfirmedPayload,
  ItemPickedUpPayload,
  ItemDeliveredPayload,
  DriverArrivedPickupPayload,
  DriverLocationUpdatePayload,
  DriverLocationUpdatedPayload,
  OfferAcceptedPayload,
  TripStatusUpdatedPayload,
} from '@/types/trip.types';

export type SocketDebugPongPayload = {
  ok: true;
  serverTime: string;
  socketId: string;
  userId: string;
  role: string;
  tripId: string | null;
  note: string | null;
};

export type RequestDeletedPayload = {
  requestId: string;
};

let socket: Socket | null = null;
let currentToken: string | null = null;

function rejectLocalized(
  reject: (reason?: unknown) => void,
  sourceMessage: string,
  fallback: string,
): void {
  void localizeResponseMessage(sourceMessage, fallback).then((localized) => {
    reject(Object.assign(new Error(localized), { sourceMessage }));
  });
}

type SocketAckResponse = {
  tripId?: string;
  room?: string;
  message?: string;
};

type ChatJoinAckResponse = {
  roomId?: string;
  status?: string;
};

function isWrappedSendChatMessageResponse(
  response: SendChatMessageResponse | ChatMessage,
): response is SendChatMessageResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'message' in response &&
    typeof response.message === 'object' &&
    response.message !== null
  );
}

function ensureSocketUrl(): string {
  return getBackendSocketUrl();
}

function getSocket(): Socket {
  if (!socket) {
    throw new Error(i18n.t('Socket is not connected. Call connectSocket first.'));
  }
  return socket;
}

export function connectSocket(token: string): void {
  if (!token.trim()) {
    throw new Error(i18n.t('Cannot connect socket without auth token.'));
  }

  const url = ensureSocketUrl();

  if (socket && currentToken === token) {
    if (!socket.connected) socket.connect();
    return;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  currentToken = token;
  socket = io(url, {
    transports: ['websocket'],
    autoConnect: true,
    auth: { token },
    extraHeaders: {
      Authorization: `Bearer ${token}`,
      'Accept-Language': i18n.resolvedLanguage ?? i18n.language ?? 'en',
    },
  });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  currentToken = null;
}

export function joinTripRoom(tripId: string): void {
  getSocket().emit('joinTripRoom', { tripId });
}

export function joinTripRoomWithAck(
  tripId: string,
  timeoutMs = 5000,
): Promise<{ tripId: string; room: string }> {
  const instance = getSocket();
  return new Promise((resolve, reject) => {
    instance.timeout(timeoutMs).emit(
      'joinTripRoom',
      { tripId },
      (error: Error | null, response?: SocketAckResponse) => {
        if (error) {
          rejectLocalized(reject, error.message || 'joinTripRoom timed out.', 'joinTripRoom timed out.');
          return;
        }

        if (!response || typeof response.tripId !== 'string' || typeof response.room !== 'string') {
          reject(new Error(i18n.t('joinTripRoom ack payload is invalid.')));
          return;
        }

        resolve({ tripId: response.tripId, room: response.room });
      },
    );
  });
}

export function leaveTripRoom(tripId: string): void {
  if (!socket) return;
  socket.emit('leaveTripRoom', { tripId });
}

export function isSocketConnected(): boolean {
  return Boolean(socket?.connected);
}

export function joinChatRoom(roomId: string): void {
  getSocket().emit('chat.join', { roomId });
}

export function joinChatRoomWithAck(
  roomId: string,
  timeoutMs = 5000,
): Promise<{ roomId: string }> {
  const instance = getSocket();
  return new Promise((resolve, reject) => {
    instance.timeout(timeoutMs).emit(
      'chat.join',
      { roomId },
      (error: Error | null, response?: ChatJoinAckResponse) => {
        if (error) {
          rejectLocalized(reject, error.message || 'chat.join timed out.', 'chat.join timed out.');
          return;
        }

        if (!response || typeof response.roomId !== 'string') {
          reject(new Error(i18n.t('chat.join ack payload is invalid.')));
          return;
        }

        resolve({ roomId: response.roomId });
      },
    );
  });
}

export function leaveChatRoom(roomId: string): void {
  if (!socket) return;
  socket.emit('chat.leave', { roomId });
}

export function sendChatMessageWithAck(
  roomId: string,
  payload: SendChatMessagePayload,
  timeoutMs = 5000,
): Promise<SendChatMessageResponse> {
  const instance = getSocket();
  return new Promise((resolve, reject) => {
    instance.timeout(timeoutMs).emit(
      'chat.message.send',
      {
        roomId,
        body: payload.body,
      },
      (error: Error | null, response?: SendChatMessageResponse | ChatMessage) => {
        if (error) {
          rejectLocalized(reject, error.message || 'chat.message.send timed out.', 'chat.message.send timed out.');
          return;
        }

        if (!response) {
          reject(new Error(i18n.t('chat.message.send ack payload is invalid.')));
          return;
        }

        if (isWrappedSendChatMessageResponse(response)) {
          resolve(response);
          return;
        }

        resolve({ message: response });
      },
    );
  });
}

export function emitChatTyping(roomId: string, isTyping: boolean): void {
  getSocket().emit('chat.typing', { roomId, isTyping });
}

export function onChatMessageCreated(
  callback: (payload: ChatMessageCreatedEventPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('chat.message.created', callback);
  instance.on('chat.message.created', callback);
  return () => instance.off('chat.message.created', callback);
}

export function onChatMessageRead(
  callback: (payload: ChatMessageReadEventPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('chat.message.read', callback);
  instance.on('chat.message.read', callback);
  return () => instance.off('chat.message.read', callback);
}

export function emitDriverLocationUpdate(payload: DriverLocationUpdatePayload): void {
  getSocket().emit('driverLocationUpdate', payload);
}

export function emitDriverArrivedPickup(payload: DriverArrivedPickupPayload): void {
  getSocket().emit('driverArrivedPickup', payload);
}

export function emitDriverArrivedPickupWithAck(
  payload: DriverArrivedPickupPayload,
  timeoutMs = 5000,
): Promise<void> {
  const instance = getSocket();
  return new Promise((resolve, reject) => {
    instance.timeout(timeoutMs).emit(
      'driverArrivedPickup',
      payload,
      (error: Error | null) => {
        if (error) {
          rejectLocalized(reject, error.message || 'driverArrivedPickup timed out.', 'driverArrivedPickup timed out.');
          return;
        }

        resolve();
      },
    );
  });
}

export function emitSocketDebugPing(payload: { tripId?: string; note?: string }): void {
  getSocket().emit('socketDebugPing', {
    ...payload,
    timestamp: new Date().toISOString(),
  });
}

export function onOfferAccepted(callback: (payload: OfferAcceptedPayload) => void): () => void {
  const instance = getSocket();
  instance.off('offerAccepted', callback);
  instance.on('offerAccepted', callback);
  return () => instance.off('offerAccepted', callback);
}

export function onRequestDeleted(
  callback: (payload: RequestDeletedPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('requestDeleted', callback);
  instance.on('requestDeleted', callback);
  return () => instance.off('requestDeleted', callback);
}

export function onDriverLocationUpdated(
  callback: (payload: DriverLocationUpdatedPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('driverLocationUpdated', callback);
  instance.on('driverLocationUpdated', callback);
  return () => instance.off('driverLocationUpdated', callback);
}

export function onDriverArrivedPickupConfirmed(
  callback: (payload: DriverArrivedPickupConfirmedPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('driverArrivedPickupConfirmed', callback);
  instance.on('driverArrivedPickupConfirmed', callback);
  return () => instance.off('driverArrivedPickupConfirmed', callback);
}

export function onTripStatusUpdated(
  callback: (payload: TripStatusUpdatedPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('tripStatusUpdated', callback);
  instance.on('tripStatusUpdated', callback);
  return () => instance.off('tripStatusUpdated', callback);
}

export function onItemPickedUp(
  callback: (payload: ItemPickedUpPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('itemPickedUp', callback);
  instance.on('itemPickedUp', callback);
  return () => instance.off('itemPickedUp', callback);
}

export function onItemDelivered(
  callback: (payload: ItemDeliveredPayload) => void,
): () => void {
  const instance = getSocket();
  instance.off('itemDelivered', callback);
  instance.on('itemDelivered', callback);
  return () => instance.off('itemDelivered', callback);
}

export function onSocketDisconnect(callback: (reason: string) => void): () => void {
  const instance = getSocket();
  instance.off('disconnect', callback);
  instance.on('disconnect', callback);
  return () => instance.off('disconnect', callback);
}

export function onSocketConnected(callback: (socketId: string) => void): () => void {
  const instance = getSocket();
  const handler = (): void => callback(instance.id ?? 'unknown');
  instance.off('connect', handler);
  instance.on('connect', handler);
  return () => instance.off('connect', handler);
}

export function waitForSocketConnection(timeoutMs = 5000): Promise<string> {
  const instance = getSocket();

  if (instance.connected) {
    return Promise.resolve(instance.id ?? 'unknown');
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      rejectLocalized(reject, 'Socket connection timeout.', 'Socket connection timeout.');
    }, timeoutMs);

    const handleConnect = (): void => {
      cleanup();
      resolve(instance.id ?? 'unknown');
    };

    const handleError = (error: Error): void => {
      cleanup();
      rejectLocalized(reject, error.message || 'Socket connect error.', 'Socket connect error.');
    };

    const cleanup = (): void => {
      clearTimeout(timer);
      instance.off('connect', handleConnect);
      instance.off('connect_error', handleError);
    };

    instance.on('connect', handleConnect);
    instance.on('connect_error', handleError);
  });
}

export function onSocketError(callback: (message: string) => void): () => void {
  const instance = getSocket();
  const handler = (error: Error): void => {
    const sourceMessage = error.message || 'Socket connection error.';
    void localizeResponseMessage(sourceMessage, 'Socket connection error.').then(callback);
  };
  instance.on('connect_error', handler);
  return () => instance.off('connect_error', handler);
}

export function onSocketDebugPong(callback: (payload: SocketDebugPongPayload) => void): () => void {
  const instance = getSocket();
  instance.off('socketDebugPong', callback);
  instance.on('socketDebugPong', callback);
  return () => instance.off('socketDebugPong', callback);
}

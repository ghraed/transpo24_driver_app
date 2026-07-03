import { io, type Socket } from 'socket.io-client';

import type {
  AdditionalExpenseResponse,
  DriverArrivedPickupConfirmedPayload,
  ItemPickedUpPayload,
  ItemDeliveredPayload,
  DriverArrivedPickupPayload,
  DriverLocationUpdatePayload,
  DriverLocationUpdatedPayload,
  OfferAcceptedPayload,
  OfferRejectedPayload,
  RequestNewPayload,
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

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL?.trim();
let socket: Socket | null = null;
let currentToken: string | null = null;

type SocketAckResponse = {
  tripId?: string;
  room?: string;
  message?: string;
};

function ensureSocketUrl(): string {
  if (!SOCKET_URL) {
    throw new Error('EXPO_PUBLIC_SOCKET_URL is missing. Please set it in your environment.');
  }
  return SOCKET_URL;
}

function getSocket(): Socket {
  if (!socket) {
    throw new Error('Socket is not connected. Call connectSocket first.');
  }
  return socket;
}

export function connectSocket(token: string): void {
  if (!token.trim()) {
    throw new Error('Cannot connect socket without auth token.');
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
          reject(new Error(error.message || 'joinTripRoom timed out.'));
          return;
        }

        if (!response || typeof response.tripId !== 'string' || typeof response.room !== 'string') {
          reject(new Error('joinTripRoom ack payload is invalid.'));
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

export function emitDriverLocationUpdate(payload: DriverLocationUpdatePayload): void {
  getSocket().emit('driverLocationUpdate', payload);
}

export function emitDriverArrivedPickup(payload: DriverArrivedPickupPayload): void {
  getSocket().emit('driverArrivedPickup', payload);
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

export function onRequestNew(callback: (payload: RequestNewPayload) => void): () => void {
  const instance = getSocket();
  instance.off('requestNew', callback);
  instance.on('requestNew', callback);
  return () => instance.off('requestNew', callback);
}

export function onOfferRejected(callback: (payload: OfferRejectedPayload) => void): () => void {
  const instance = getSocket();
  instance.off('offerRejected', callback);
  instance.on('offerRejected', callback);
  return () => instance.off('offerRejected', callback);
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

export function onAdditionalChargeAdded(
  callback: (payload: AdditionalExpenseResponse) => void,
): () => void {
  const instance = getSocket();
  instance.off('additionalChargeAdded', callback);
  instance.on('additionalChargeAdded', callback);
  return () => instance.off('additionalChargeAdded', callback);
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
      reject(new Error('Socket connection timeout.'));
    }, timeoutMs);

    const handleConnect = (): void => {
      cleanup();
      resolve(instance.id ?? 'unknown');
    };

    const handleError = (error: Error): void => {
      cleanup();
      reject(new Error(error.message || 'Socket connect error.'));
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
  const handler = (error: Error): void => callback(error.message || 'Socket connection error.');
  instance.on('connect_error', handler);
  return () => instance.off('connect_error', handler);
}

export function onSocketDebugPong(callback: (payload: SocketDebugPongPayload) => void): () => void {
  const instance = getSocket();
  instance.off('socketDebugPong', callback);
  instance.on('socketDebugPong', callback);
  return () => instance.off('socketDebugPong', callback);
}

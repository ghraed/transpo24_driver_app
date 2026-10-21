import React, { useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { ApiResponseError, getDriverChatRoomByTransportRequestId } from '@/lib/api';
import { useDriverChatRoom } from './useDriverChatRoom';

const mockT = (key) => key;
jest.mock('expo-router', () => ({
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('@/lib/api', () => ({
  getDriverChatRoomByTransportRequestId: jest.fn(),
  ApiResponseError: class extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  },
}));
jest.mock('@/localization/response-message', () => ({
  getSourceErrorMessage: (error) => error.sourceMessage ?? error.message,
}));

let state;
let tree;
function Harness() {
  const result = useDriverChatRoom(' request-1 ');
  useEffect(() => {
    state = result;
  }, [result]);
  return null;
}
async function mount() {
  await act(async () => {
    tree = create(<Harness />);
  });
}
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = undefined;
});

test('treats the payment window as a waiting state instead of an error', async () => {
  const message = 'Driver chat becomes available after the first 10 minutes following payment.';
  getDriverChatRoomByTransportRequestId.mockRejectedValue(new ApiResponseError(message, 403));
  await mount();
  expect(state.chatRoomError).toBe('');
  expect(state.isChatPending).toBe(true);
  getDriverChatRoomByTransportRequestId.mockResolvedValueOnce({ id: 'room-1' });
  await act(async () => state.refreshChatRoom());
  expect(state.isChatPending).toBe(false);
  expect(state.chatRoom.id).toBe('room-1');
  expect(getDriverChatRoomByTransportRequestId).toHaveBeenCalledWith('request-1');
});

test('keeps server details private and recovers when retry succeeds', async () => {
  getDriverChatRoomByTransportRequestId.mockRejectedValueOnce(
    new ApiResponseError('Database query failed', 500),
  );
  await mount();
  expect(state.chatRoomError).toBe('Failed to load chat room.');
  const room = { id: 'room-1', transportRequestId: 'request-1' };
  getDriverChatRoomByTransportRequestId.mockResolvedValueOnce(room);
  await act(async () => state.refreshChatRoom());
  expect(state.chatRoom).toEqual(room);
  expect(state.chatRoomError).toBe('');
});

test('does not describe a network failure as a server error', async () => {
  getDriverChatRoomByTransportRequestId.mockRejectedValue(new Error('Network request failed'));
  await mount();
  expect(state.chatRoomError).toBe('Network request failed');
});

test('treats a missing chat room as unavailable', async () => {
  getDriverChatRoomByTransportRequestId.mockRejectedValue(
    new ApiResponseError('Chat room not found.', 404),
  );
  await mount();
  expect(state.chatRoom).toBeNull();
  expect(state.chatRoomError).toBe('');
});

test('recognizes the payment window when the API error is localized', async () => {
  const error = new ApiResponseError('Disponible après le paiement.', 403);
  error.sourceMessage =
    'Driver chat becomes available after the first 10 minutes following payment.';
  getDriverChatRoomByTransportRequestId.mockRejectedValue(error);
  await mount();
  expect(state.isChatPending).toBe(true);
  expect(state.chatRoomError).toBe('');
});

test('does not label other access restrictions as the payment window', async () => {
  getDriverChatRoomByTransportRequestId.mockRejectedValue(
    new ApiResponseError('Driver approval required.', 403),
  );
  await mount();
  expect(state.isChatPending).toBe(false);
  expect(state.chatRoomError).toBe('Driver approval required.');
});

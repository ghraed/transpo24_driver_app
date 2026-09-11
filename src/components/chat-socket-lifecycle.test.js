import { expect, it, jest } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ChatScreen from '@/app/chat';
import * as api from '@/lib/api';
import * as socket from '@/services/socketService';

jest.mock('expo-router', () => {
  const React = require('react');
  const router = { replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
  return {
    Stack: { Screen: () => null },
    useRouter: () => router,
    useLocalSearchParams: () => ({ chatRoomId: 'room' }),
    useFocusEffect: callback => React.useEffect(callback, [callback]),
  };
});
jest.mock('react-i18next', () => {
  const t = key => key;
  return { useTranslation: () => ({ t }) };
});
jest.mock('@/context/auth-context', () => {
  const auth = { accessToken: 'token', user: { id: 'driver' }, signOut: jest.fn() };
  return { useAuth: () => auth };
});
jest.mock('@/localization/response-message', () => ({ getSourceErrorMessage: (_error, fallback) => fallback }));
jest.mock('@/localization/provider', () => ({ useAppLanguage: () => ({ language: 'en' }) }));
jest.mock('@/services/translation-service', () => ({ translateDynamicText: jest.fn() }));
jest.mock('@/lib/api', () => ({
  getDriverChatRoom: jest.fn(), getDriverChatMessages: jest.fn(),
  markDriverChatRoomMessagesRead: jest.fn(),
}));
jest.mock('@/services/socketService', () => ({
  connectSocket: jest.fn(), waitForSocketConnection: jest.fn(async () => undefined),
  joinChatRoomWithAck: jest.fn(async () => ({})), leaveChatRoom: jest.fn(),
  onChatMessageCreated: jest.fn(() => jest.fn()), onChatMessageRead: jest.fn(() => jest.fn()),
  onSocketDisconnect: jest.fn(() => jest.fn()), onSocketError: jest.fn(() => jest.fn()),
}));
jest.mock('@/components/chat-wallpaper', () => ({ ChatWallpaper: () => null }));
jest.mock('@/components/chat-attachment', () => ({ ChatAttachment: () => null, ChatAttachmentButton: () => null }));
jest.mock('@/components/chat-attachment-group', () => ({ ChatAttachmentGroup: () => null }));
jest.mock('@/components/chat-icon', () => ({ ChatIcon: () => null }));
jest.mock('@/components/driver-icon', () => ({ DriverIcon: () => null }));

it('keeps one subscription when read receipts and incoming messages update room metadata', async () => {
  const room = { id: 'room', driverId: 'driver', clientId: 'client', acceptedOfferId: 'offer', status: 'ACTIVE' };
  api.getDriverChatRoom.mockResolvedValue(room);
  api.getDriverChatMessages.mockResolvedValue({ room, messages: [] });
  // Bound the old regression so it fails assertions instead of looping forever.
  api.markDriverChatRoomMessagesRead.mockResolvedValueOnce({ readAt: '2026-09-11T10:00:00Z' })
    .mockImplementation(() => new Promise(() => {}));
  let tree;
  try {
    await act(async () => { tree = create(<ChatScreen />); });
    expect(socket.joinChatRoomWithAck).toHaveBeenCalledTimes(1);
    expect(api.markDriverChatRoomMessagesRead).toHaveBeenCalledTimes(1);
    await act(async () => {
      socket.onChatMessageCreated.mock.calls[0][0]({ message: {
        id: 'message', chatRoomId: 'room', senderId: 'driver', senderRole: 'DRIVER',
        type: 'TEXT', body: 'Hello', createdAt: '2026-09-11T10:01:00Z',
      } });
    });
    expect(socket.joinChatRoomWithAck).toHaveBeenCalledTimes(1);
    expect(socket.leaveChatRoom).not.toHaveBeenCalled();
  } finally {
    await act(async () => tree?.unmount());
  }
  expect(socket.leaveChatRoom).toHaveBeenCalledWith('room');
});

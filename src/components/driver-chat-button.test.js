import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { DriverChatButton } from './driver-chat-button';
import { useDriverChatRoom } from '@/hooks/useDriverChatRoom';
import { DriverButton } from './ui/driver-ui';

const mockPush = jest.fn();
const mockT = (key) => key;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/hooks/useDriverChatRoom', () => ({ useDriverChatRoom: jest.fn() }));
const refresh = jest.fn();
let tree;
const text = () =>
  tree.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .join(' ');
const render = async (props) => {
  await act(async () => {
    tree = create(<DriverChatButton transportRequestId="request-1" {...props} />);
  });
};
beforeEach(() => {
  jest.clearAllMocks();
  useDriverChatRoom.mockReturnValue({
    chatRoom: null,
    chatRoomError: '',
    isLoadingChatRoom: false,
    isChatPending: false,
    refreshChatRoom: refresh,
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = undefined;
});

test('presents the payment window as a neutral availability card with a check action', async () => {
  useDriverChatRoom.mockReturnValue({ isChatPending: true, refreshChatRoom: refresh });
  await render();
  expect(text()).toContain('pickupUi.chatPaymentWindow');
  expect(text()).toContain('pickupUi.pending');
  expect(text()).not.toContain('Retry chat');
  await act(async () => tree.root.findByType(DriverButton).props.onPress());
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('opens the correct chat when available', async () => {
  useDriverChatRoom.mockReturnValue({
    chatRoom: { id: 'room-1', transportRequestId: 'request-1', clientNickname: 'Karim' },
  });
  await render();
  await act(async () => tree.root.findByType(DriverButton).props.onPress());
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/chat',
    params: { chatRoomId: 'room-1', transportRequestId: 'request-1' },
  });
});

test('keeps connection failures recoverable without showing raw backend messages', async () => {
  useDriverChatRoom.mockReturnValue({
    chatRoomError: 'Prisma query failed',
    refreshChatRoom: refresh,
  });
  await render();
  expect(text()).toContain('pickupUi.chatConnectionIssue');
  expect(text()).not.toContain('Prisma');
  expect(text()).toContain('Retry chat');
});

test('disables duplicate checks during loading', async () => {
  useDriverChatRoom.mockReturnValue({ isLoadingChatRoom: true, refreshChatRoom: refresh });
  await render();
  expect(tree.root.findByType(DriverButton).props.loading).toBe(true);
});

test('does not offer chat on a completed trip even with a cached room', async () => {
  useDriverChatRoom.mockReturnValue({ chatRoom: { id: 'room-1' } });
  await render({ requestStatus: 'DELIVERED', showUnavailableState: true });
  expect(text()).toContain('Chat closed after delivery');
  expect(tree.root.findAllByType(DriverButton)).toHaveLength(0);
});

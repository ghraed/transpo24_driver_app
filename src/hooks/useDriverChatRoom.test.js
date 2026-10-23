import React from 'react';
import { act, create } from 'react-test-renderer';
import { useDriverChatRoom } from './useDriverChatRoom';
import { ApiResponseError, getDriverChatRoomByTransportRequestId } from '@/lib/api';

const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-router', () => ({ useFocusEffect: callback => require('react').useEffect(callback, [callback]) }));
jest.mock('@/localization/response-message', () => ({ getSourceErrorMessage: error => error.message }));
jest.mock('@/lib/api', () => ({
  ApiResponseError: class extends Error {},
  getDriverChatRoomByTransportRequestId: jest.fn(),
}));
let tree;
let result;
function Harness() { const value = useDriverChatRoom('request'); React.useEffect(() => { result = value; }, [value]); return null; }
beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-10-23T10:00:00Z')); jest.clearAllMocks(); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.useRealTimers(); });
test('counts down using server time despite clock skew and automatically checks at expiry', async () => {
  const error = Object.assign(new ApiResponseError('Pending'), {
    status: 403, code: 'CHAT_PAYMENT_WINDOW',
    serverTime: '2026-10-23T12:00:00Z', availableAt: '2026-10-23T12:00:02Z',
  });
  getDriverChatRoomByTransportRequestId.mockRejectedValueOnce(error).mockResolvedValue({ id: 'room' });
  await act(async () => { tree = create(<Harness />); });
  expect(result.chatSecondsRemaining).toBe(2);
  await act(async () => jest.advanceTimersByTime(1000));
  expect(result.chatSecondsRemaining).toBe(1);
  await act(async () => jest.advanceTimersByTime(1000));
  expect(getDriverChatRoomByTransportRequestId).toHaveBeenCalledTimes(2);
  expect(result.chatRoom.id).toBe('room');
  expect(result.isChatPending).toBe(false);
  expect(result.chatSecondsRemaining).toBeNull();
});
test('does not invent a timer when no unlock timestamp is supplied', async () => {
  getDriverChatRoomByTransportRequestId.mockRejectedValue(Object.assign(new ApiResponseError('Pending'), { status: 403, code: 'CHAT_PAYMENT_WINDOW' }));
  await act(async () => { tree = create(<Harness />); });
  expect(result.isChatPending).toBe(true);
  expect(result.chatSecondsRemaining).toBeNull();
  await act(async () => jest.advanceTimersByTime(10000));
  expect(getDriverChatRoomByTransportRequestId).toHaveBeenCalledTimes(1);
});

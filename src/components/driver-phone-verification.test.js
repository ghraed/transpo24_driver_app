import React from 'react';
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import VerifyPhoneScreen from '@/app/verify-phone';

const mockRouter = {
  canDismiss: jest.fn(),
  dismissAll: jest.fn(),
  replace: jest.fn(),
};
const mockAuthenticate = jest.fn();
const mockClearRoute = jest.fn(async () => {});
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ phoneNumber: '+96170123456' }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ authenticateWithPhone: mockAuthenticate }) }));
jest.mock('@/lib/auth-storage', () => ({
  clearLastOnboardingRoute: (...args) => mockClearRoute(...args),
  readLastOnboardingRoute: jest.fn(async () => null),
}));
jest.mock('@/lib/api', () => ({ sendDriverPhoneVerificationCode: jest.fn() }));
jest.mock('@/notifications/registerPushNotifications', () => ({ registerDriverPushNotifications: jest.fn(async () => {}) }));

let tree;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockAuthenticate.mockResolvedValue('HOME');
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.useRealTimers();
});

async function enterCode() {
  await act(async () => { tree = create(<VerifyPhoneScreen />); });
  await act(async () => tree.root.findAllByType(TextInput)[0].props.onChangeText('123456'));
  await act(async () => jest.advanceTimersByTime(0));
}

test.each([false, true])('successful login reaches available requests when history can be dismissed: %s', async canDismiss => {
  mockRouter.canDismiss.mockReturnValue(canDismiss);
  await enterCode();
  expect(mockAuthenticate).toHaveBeenCalledWith({ phoneNumber: '+96170123456', code: '123456' });
  expect(mockRouter.dismissAll).toHaveBeenCalledTimes(canDismiss ? 1 : 0);
  expect(mockRouter.replace).toHaveBeenCalledWith('/receive-requests');
  expect(mockClearRoute).toHaveBeenCalledTimes(1);
  if (canDismiss) {
    expect(mockRouter.dismissAll.mock.invocationCallOrder[0]).toBeLessThan(mockRouter.replace.mock.invocationCallOrder[0]);
  }
});

test('a rejected verification code does not navigate', async () => {
  mockAuthenticate.mockRejectedValue(new Error('Invalid code'));
  await enterCode();
  expect(mockRouter.dismissAll).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import DriverTripCompletedScreen from '@/app/driver-trip-completed';
import * as api from '@/lib/api';
import { stopBackgroundTripTracking } from '@/location/background-trip-tracking';

let mockParams;
const mockT = (key) => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@/location/background-trip-tracking', () => ({
  stopBackgroundTripTracking: jest.fn(async () => undefined),
}));
jest.mock('@/lib/api', () => ({
  getStripeConnectStatus: jest.fn(),
  syncStripeConnectAccount: jest.fn(),
  retryTransferForTrip: jest.fn(),
}));
let tree;
const render = async () => {
  await act(async () => {
    tree = create(<DriverTripCompletedScreen />);
  });
};
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {
    fromHistory: 'true',
    tripStatus: 'DRIVER_GOING_TO_PICKUP',
    tripId: 'cmvwfhyru0027jve766oz7eo6',
  };
  api.getStripeConnectStatus.mockResolvedValue({
    stripeAccountId: 'acct_driver',
    payoutsEnabled: true,
  });
  api.syncStripeConnectAccount.mockResolvedValue({});
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});

test('opening an active held payment does not stop tracking or claim delivery or attempt capture', async () => {
  await render();
  expect(stopBackgroundTripTracking).not.toHaveBeenCalled();
  expect(api.retryTransferForTrip).not.toHaveBeenCalled();
  const text = tree.root.findAllByType(Text).map((node) => node.props.children);
  expect(text).not.toContain('Delivery confirmed successfully.');
  expect(text).not.toContain('Release Held Funds');
  expect(text).toContain('Back to Earnings History');
});

test('a delivered held payment offers release but only requests it when pressed', async () => {
  mockParams.tripStatus = 'DELIVERED';
  api.retryTransferForTrip.mockResolvedValue({ transferred: true, stripeTransferId: null });
  await render();
  expect(api.retryTransferForTrip).not.toHaveBeenCalled();
  const button = tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) =>
      node.findAllByType(Text).some((text) => text.props.children === 'Release Held Funds'),
    );
  await act(async () => button.props.onPress());
  expect(api.retryTransferForTrip).toHaveBeenCalledWith(mockParams.tripId);
});

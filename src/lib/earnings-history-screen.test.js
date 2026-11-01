import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import EarningsHistoryScreen from '@/app/earnings-history';
import { DriverIcon } from '@/components/driver-icon';
import * as api from '@/lib/api';

const mockPush = jest.fn();
const mockT = (key, options) => key.replace('{{id}}', options?.id ?? '');
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@/localization/provider', () => ({
  useAppLanguage: () => ({ locale: 'en-CH', isRTL: false }),
}));
jest.mock('@/lib/api', () => ({ getDriverPaymentHistory: jest.fn() }));

const held = {
  id: 'hold',
  tripId: 'cmvwfhyru0027jve766oz7eo6',
  netAmount: 17,
  currency: 'CHF',
  status: 'PENDING',
  paymentStatus: 'PAYMENT_HELD',
  tripStatus: 'DRIVER_GOING_TO_PICKUP',
  deliveredAt: null,
};
const captured = {
  ...held,
  id: 'earning',
  tripId: 'captured-trip',
  status: 'PAID_OUT',
  paymentStatus: 'PAYMENT_CAPTURED',
  tripStatus: 'DELIVERED',
};
let tree;
const render = async () => {
  await act(async () => {
    tree = create(<EarningsHistoryScreen />);
  });
};
beforeEach(() => {
  jest.clearAllMocks();
  api.getDriverPaymentHistory.mockResolvedValue({
    items: [held, captured],
    page: 1,
    totalPages: 1,
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});

test('shows captured and uncaptured payments and opens held funds through a visible arrow', async () => {
  await render();
  const json = tree.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .join(' ');
  expect(json).toContain('Not captured');
  expect(json).toContain('Captured');
  expect(json).toContain('Before Stripe fees');
  const clickable = tree.root.findAll(
    (node) =>
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityHint === 'Opens the trip payment release screen.',
  );
  expect(clickable).toHaveLength(1);
  expect(
    clickable[0].findAllByType(DriverIcon).some((node) => node.props.name === 'chevron-right'),
  ).toBe(true);
  await act(async () => clickable[0].props.onPress());
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/driver-trip-completed',
    params: {
      tripId: held.tripId,
      deliveredAt: '',
      tripStatus: held.tripStatus,
      fromHistory: 'true',
    },
  });
});

test('does not offer release navigation for cancelled, refunded or review payments', async () => {
  api.getDriverPaymentHistory.mockResolvedValue({
    items: [
      { ...held, tripId: 'cancelled', tripStatus: 'CANCELLED' },
      { ...held, tripId: 'review', requiresManualReview: true },
      { ...held, tripId: 'refunded', paymentStatus: 'PAYMENT_REFUNDED' },
    ],
    page: 1,
    totalPages: 1,
  });
  await render();
  expect(
    tree.root.findAll(
      (node) => typeof node.props.onPress === 'function' && Boolean(node.props.accessibilityHint),
    ),
  ).toHaveLength(0);
  expect(
    tree.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .join(' '),
  ).toContain('Under review');
});

test('loads later pages so history includes more than the first twenty payments', async () => {
  api.getDriverPaymentHistory
    .mockResolvedValueOnce({ items: [held], page: 1, totalPages: 2 })
    .mockResolvedValueOnce({ items: [held, captured], page: 2, totalPages: 2 });
  await render();
  const button = tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.props.accessibilityLabel === 'Load more');
  await act(async () => button.props.onPress());
  expect(api.getDriverPaymentHistory).toHaveBeenLastCalledWith(2);
  expect(
    tree.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .join(' '),
  ).toContain('Captured');
  expect(
    tree.root.findAll(
      (node) => typeof node.props.onPress === 'function' && Boolean(node.props.accessibilityHint),
    ),
  ).toHaveLength(1);
});

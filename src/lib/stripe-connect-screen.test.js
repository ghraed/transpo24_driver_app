import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import StripeConnectScreen from '@/app/stripe-connect';
import * as api from '@/lib/api';

const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useFocusEffect: callback => require('react').useEffect(callback, [callback]),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@/lib/api', () => ({
  createStripeConnectAccount: jest.fn(),
  getStripeConnectDashboardLink: jest.fn(),
  getStripeConnectStatus: jest.fn(),
  removeStripeConnectAccount: jest.fn(),
  syncStripeConnectAccount: jest.fn(),
}));

const connected = {
  stripeAccountId: 'acct_old', detailsSubmitted: true, payoutsEnabled: true, accountStatus: 'details_submitted',
};
const disconnected = {
  stripeAccountId: null, detailsSubmitted: false, payoutsEnabled: false, accountStatus: null,
};
let tree;
const button = label => tree.root.findAll(node => typeof node.props.onPress === 'function' && (
  node.props.accessibilityLabel === label || node.findAllByType(Text).some(text => text.props.children === label)))[0];
const press = async label => { await act(async () => button(label).props.onPress()); };
const render = async () => { await act(async () => { tree = create(<StripeConnectScreen />); }); };
beforeEach(() => {
  jest.clearAllMocks();
  api.getStripeConnectStatus.mockResolvedValue(connected);
  api.syncStripeConnectAccount.mockResolvedValue(connected);
  api.removeStripeConnectAccount.mockResolvedValue(disconnected);
  api.createStripeConnectAccount.mockResolvedValue({ onboardingUrl: null });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

test('requires confirmation, supports cancellation, and resets the page after removal', async () => {
  await render();
  await press('Remove Stripe account');
  expect(api.removeStripeConnectAccount).not.toHaveBeenCalled();
  await press('Cancel');
  expect(api.removeStripeConnectAccount).not.toHaveBeenCalled();
  await press('Remove Stripe account');
  await press('Remove Stripe account');
  expect(api.removeStripeConnectAccount).toHaveBeenCalledTimes(1);
  expect(button('Create Stripe Account')).toBeDefined();
  expect(tree.root.findByType(TextInput).props.value).toBe('');
});

test('keeps the account connected and offers retry when removal fails', async () => {
  api.removeStripeConnectAccount.mockRejectedValue(new Error('offline'));
  await render();
  await press('Remove Stripe account');
  await press('Remove Stripe account');
  expect(JSON.stringify(tree.toJSON())).toContain('Failed to remove Stripe account. Please try again.');
  expect(button('Remove Stripe account').props.disabled).toBe(false);
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
});

test.each(['original@example.com', 'different@example.com', ''])(
  'reconnects with email %s', async email => {
    api.getStripeConnectStatus.mockResolvedValue(disconnected);
    await render();
    await act(async () => tree.root.findByType(TextInput).props.onChangeText(email));
    await press('Create Stripe Account');
    expect(api.createStripeConnectAccount).toHaveBeenCalledWith(email);
  },
);
